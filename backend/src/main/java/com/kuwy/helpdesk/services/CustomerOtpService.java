package com.kuwy.helpdesk.services;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class CustomerOtpService {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final long OTP_VALIDITY_SECONDS = 300L; // 5 minutes
    private static final int MAX_ATTEMPTS = 5;

    private final EmailService emailService;
    private final Map<String, OtpEntry> otpStore = new ConcurrentHashMap<>();

    @Data
    @AllArgsConstructor
    private static class OtpEntry {
        private final String hashedOtp;
        private final Long companyId;
        private final Instant expiresAt;
        private int remainingAttempts;

        public boolean isExpired() {
            return Instant.now().isAfter(expiresAt);
        }
    }

    private String getCacheKey(Long companyId, String email) {
        return companyId + ":" + email.trim().toLowerCase();
    }

    /**
     * Generates a random 6-digit cryptographically secure OTP and dispatches it via EmailService.
     */
    public void generateAndDispatchOtp(Long companyId, String email, String companyName) {
        String cleanEmail = email.trim().toLowerCase();
        int randomCode = 100000 + RANDOM.nextInt(900000);
        String otpString = String.valueOf(randomCode);

        String hashed = hashOtp(otpString);
        Instant expiresAt = Instant.now().plusSeconds(OTP_VALIDITY_SECONDS);

        otpStore.put(getCacheKey(companyId, cleanEmail), new OtpEntry(hashed, companyId, expiresAt, MAX_ATTEMPTS));

        // Dispatch via email
        emailService.sendCustomerOtp(cleanEmail, otpString, companyName);
        log.info("Dispatched customer OTP verification code to [{}] for company ID {}", cleanEmail, companyId);
    }

    /**
     * Verifies the OTP in constant time, decrementing attempts.
     */
    public boolean verifyOtp(Long companyId, String email, String inputOtp) {
        if (inputOtp == null || inputOtp.isBlank()) {
            return false;
        }
        String key = getCacheKey(companyId, email);
        OtpEntry entry = otpStore.get(key);

        if (entry == null) {
            return false;
        }

        if (entry.isExpired()) {
            otpStore.remove(key);
            return false;
        }

        if (entry.getRemainingAttempts() <= 0) {
            otpStore.remove(key);
            log.warn("Customer OTP verification attempts exceeded for [{}]", email);
            return false;
        }

        entry.setRemainingAttempts(entry.getRemainingAttempts() - 1);

        String inputHashed = hashOtp(inputOtp.trim());
        boolean matches = MessageDigest.isEqual(entry.getHashedOtp().getBytes(), inputHashed.getBytes());

        if (matches) {
            otpStore.remove(key); // Invalidate single-use code immediately
            return true;
        }

        if (entry.getRemainingAttempts() <= 0) {
            otpStore.remove(key);
        }
        return false;
    }

    private String hashOtp(String otp) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(otp.getBytes());
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 algorithm missing", e);
        }
    }
}
