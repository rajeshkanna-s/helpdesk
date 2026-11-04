package com.kuwy.helpdesk.services;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class CustomerOtpService {

    private static final long OTP_VALIDITY_SECONDS = 300L; // 5 minutes
    private static final int MAX_ATTEMPTS = 5;
    private static final int CACHE_PARTITIONS = 64;
    private static final int MAX_ENTRIES_PER_PARTITION = 128;
    private static final Pattern EMAIL = Pattern.compile(
            "[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@"
                    + "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+"
                    + "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?");

    private final AccountEmailService accountEmailService;
    private final PasswordEncoder passwordEncoder;
    private final Clock clock;
    private final SecureRandom random;
    private final List<Map<String, OtpEntry>> otpStores = new ArrayList<>(CACHE_PARTITIONS);

    @Autowired
    public CustomerOtpService(AccountEmailService accountEmailService, PasswordEncoder passwordEncoder) {
        this(accountEmailService, passwordEncoder, Clock.systemUTC(), new SecureRandom());
    }

    CustomerOtpService(AccountEmailService accountEmailService, PasswordEncoder passwordEncoder,
            Clock clock, SecureRandom random) {
        this.accountEmailService = accountEmailService;
        this.passwordEncoder = passwordEncoder;
        this.clock = clock;
        this.random = random;
        for (int i = 0; i < CACHE_PARTITIONS; i++) {
            otpStores.add(new HashMap<>());
        }
    }

    private static final class OtpEntry {
        private final String hashedOtp;
        private final Instant expiresAt;
        private int remainingAttempts = MAX_ATTEMPTS;

        private OtpEntry(String hashedOtp, Instant expiresAt) {
            this.hashedOtp = hashedOtp;
            this.expiresAt = expiresAt;
        }
    }

    private Map<String, OtpEntry> storeFor(String key) {
        return otpStores.get(Math.floorMod(key.hashCode(), CACHE_PARTITIONS));
    }

    /**
     * Queues a random code in the encrypted outbox; queue acceptance is not delivery confirmation.
     */
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public void generateAndDispatchOtp(Long companyId, String email, String companyName) {
        String cleanEmail = canonicalEmail(email);
        if (companyId == null || companyId <= 0) {
            throw new IllegalArgumentException("Valid company required");
        }
        String key = companyId + ":" + cleanEmail;
        Map<String, OtpEntry> otpStore = storeFor(key);
        // Fixed partitions bound both locks and entries without serializing every tenant together.
        synchronized (otpStore) {
            Instant now = clock.instant();
            otpStore.values().removeIf(entry -> !now.isBefore(entry.expiresAt));
            if (!otpStore.containsKey(key) && otpStore.size() >= MAX_ENTRIES_PER_PARTITION) {
                throw new IllegalStateException("CUSTOMER_OTP_UNAVAILABLE");
            }
            try {
                accountEmailService.requireReady();
                String otp = String.format(Locale.ROOT, "%06d", random.nextInt(1_000_000));
                String hashed = passwordEncoder.encode(otp);
                if (hashed == null || hashed.isBlank() || hashed.equals(otp)) {
                    throw new IllegalStateException("CUSTOMER_OTP_UNAVAILABLE");
                }
                String name = companyName == null || companyName.isBlank() ? "the customer portal" : companyName;
                String queuedId = accountEmailService.enqueue(companyId, cleanEmail, "Your sign-in verification code",
                        "<p>Use this code to sign in to " + HtmlUtils.htmlEscape(name) + ":</p>"
                                + "<p><strong>" + otp + "</strong></p>"
                                + "<p>This code expires in five minutes and can be used only once. "
                                + "If you did not request it, ignore this email.</p>",
                        "customer-otp:" + UUID.randomUUID());
                if (queuedId == null || queuedId.isBlank()) {
                    throw new IllegalStateException("CUSTOMER_OTP_UNAVAILABLE");
                }
                // Enqueue commits before publication; a failed resend leaves the previous entry unchanged.
                otpStore.put(key, new OtpEntry(hashed, clock.instant().plusSeconds(OTP_VALIDITY_SECONDS)));
            } catch (RuntimeException ignored) {
                throw new IllegalStateException("CUSTOMER_OTP_UNAVAILABLE");
            }
        }
    }

    /**
     * Verifies and consumes under the same lock used to publish a queued replacement.
     */
    public boolean verifyOtp(Long companyId, String email, String inputOtp) {
        if (companyId == null || companyId <= 0 || inputOtp == null || !inputOtp.matches("[0-9]{6}")) {
            return false;
        }
        String cleanEmail;
        try {
            cleanEmail = canonicalEmail(email);
        } catch (IllegalArgumentException invalid) {
            return false;
        }
        String key = companyId + ":" + cleanEmail;
        Map<String, OtpEntry> otpStore = storeFor(key);
        synchronized (otpStore) {
            OtpEntry entry = otpStore.get(key);
            if (entry == null) {
                return false;
            }
            if (!clock.instant().isBefore(entry.expiresAt) || entry.remainingAttempts <= 0) {
                otpStore.remove(key, entry);
                return false;
            }
            entry.remainingAttempts--;
            boolean matches;
            try {
                matches = passwordEncoder.matches(inputOtp, entry.hashedOtp);
            } catch (RuntimeException ignored) {
                otpStore.remove(key, entry);
                return false;
            }
            if (!clock.instant().isBefore(entry.expiresAt)) {
                otpStore.remove(key, entry);
                return false;
            }
            if (matches) {
                return otpStore.remove(key, entry);
            }
            if (entry.remainingAttempts == 0) {
                otpStore.remove(key, entry);
            }
            return false;
        }
    }

    public static String canonicalEmail(String email) {
        if (email == null || email.length() > 254 || email.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("Valid email address required");
        }
        String cleanEmail = email.trim().toLowerCase(Locale.ROOT);
        if (cleanEmail.indexOf('@') > 64 || !EMAIL.matcher(cleanEmail).matches()) {
            throw new IllegalArgumentException("Valid email address required");
        }
        return cleanEmail;
    }
}
