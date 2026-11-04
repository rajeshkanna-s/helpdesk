package com.kuwy.helpdesk.services;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.*;

@Slf4j
@Service
public class TwoFactorAuthService {

    private static final String BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Clock clock;

    public TwoFactorAuthService() {
        this(Clock.systemUTC());
    }

    TwoFactorAuthService(Clock clock) {
        this.clock = Objects.requireNonNull(clock);
    }

    /**
     * Generate a new 160-bit (32 base32 characters) secret key
     */
    public String generateSecretKey() {
        byte[] bytes = new byte[20];
        RANDOM.nextBytes(bytes);
        return encodeBase32(bytes);
    }

    /**
     * Generate an otpauth:// URL for QR code generation
     */
    public String getOtpAuthUrl(String companyName, String email, String secret) {
        String issuer = companyName.replaceAll("[^a-zA-Z0-9 ]", "").trim();
        return String.format("otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=6&period=30",
                issuer, email, secret, issuer);
    }

    /**
     * Generate 8 random one-time backup codes (format: XXXX-XXXX)
     */
    public List<String> generateBackupCodes() {
        List<String> codes = new ArrayList<>();
        for (int i = 0; i < 8; i++) {
            int part1 = 1000 + RANDOM.nextInt(9000);
            int part2 = 1000 + RANDOM.nextInt(9000);
            codes.add(part1 + "-" + part2);
        }
        return codes;
    }

    /**
     * Verify a 6-digit TOTP code against the secret key
     */
    public boolean verifyTotpCode(String secret, String inputCode) {
        if (secret == null || inputCode == null) return false;
        String cleanCode = inputCode.trim();
        if (!cleanCode.matches("[0-9]{6}")) {
            return false;
        }

        try {
            byte[] key = decodeBase32(secret);
            long currentWindow = clock.instant().getEpochSecond() / 30L;
            boolean matched = false;
            // Check current window and +/- 1 window for clock drift
            for (long i = -1; i <= 1; i++) {
                String expected = generateTotpForWindow(key, currentWindow + i);
                matched |= constantTimeEquals(expected, cleanCode);
            }
            return matched;
        } catch (IllegalArgumentException e) {
            return false;
        } catch (GeneralSecurityException e) {
            log.error("Error verifying TOTP code", e);
        }
        return false;
    }

    /**
     * Verify a backup code against the comma-separated list of unused codes
     */
    public boolean verifyBackupCode(String commaSeparatedBackupCodes, String inputCode) {
        if (commaSeparatedBackupCodes == null || inputCode == null) return false;
        String cleanInput = inputCode.trim();
        if (!cleanInput.matches("[0-9]{4}-[0-9]{4}")) return false;

        boolean matched = false;
        for (String code : commaSeparatedBackupCodes.split(",")) {
            matched |= constantTimeEquals(code.trim(), cleanInput);
        }
        return matched;
    }

    /**
     * Remove used backup code from list
     */
    public String removeUsedBackupCode(String commaSeparatedBackupCodes, String usedCode) {
        if (commaSeparatedBackupCodes == null) return "";
        if (usedCode == null) return commaSeparatedBackupCodes;
        String cleanInput = usedCode.trim();
        if (!cleanInput.matches("[0-9]{4}-[0-9]{4}")) return commaSeparatedBackupCodes;

        List<String> codes = new ArrayList<>(Arrays.asList(commaSeparatedBackupCodes.split(",", -1)));
        codes.removeIf(code -> constantTimeEquals(code.trim(), cleanInput));
        return String.join(",", codes);
    }

    private boolean constantTimeEquals(String expected, String actual) {
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                actual.getBytes(StandardCharsets.UTF_8));
    }

    private String generateTotpForWindow(byte[] key, long window) throws GeneralSecurityException {
        byte[] data = ByteBuffer.allocate(8).putLong(window).array();

        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(key, "RAW"));
        byte[] hash = mac.doFinal(data);

        int offset = hash[hash.length - 1] & 0xf;
        int binary = ((hash[offset] & 0x7f) << 24)
                | ((hash[offset + 1] & 0xff) << 16)
                | ((hash[offset + 2] & 0xff) << 8)
                | (hash[offset + 3] & 0xff);

        int otp = binary % 1000000;
        return String.format(Locale.ROOT, "%06d", otp);
    }

    private String encodeBase32(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0;
        int next = 0;
        int bitsLeft = 0;
        while (next < data.length) {
            buffer = (buffer << 8) | (data[next++] & 0xff);
            bitsLeft += 8;
            while (bitsLeft >= 5) {
                bitsLeft -= 5;
                sb.append(BASE32_CHARS.charAt((buffer >> bitsLeft) & 0x1f));
            }
        }
        if (bitsLeft > 0) {
            buffer <<= (5 - bitsLeft);
            sb.append(BASE32_CHARS.charAt(buffer & 0x1f));
        }
        return sb.toString();
    }

    private byte[] decodeBase32(String base32) {
        if (base32 == null || !base32.matches("[A-Za-z2-7]+={0,6}")) {
            throw new IllegalArgumentException("Invalid Base32 secret");
        }
        int paddingStart = base32.indexOf('=');
        String clean = (paddingStart < 0 ? base32 : base32.substring(0, paddingStart))
                .toUpperCase(Locale.ROOT);
        int remainder = clean.length() % 8;
        if (remainder == 1 || remainder == 3 || remainder == 6
                || (paddingStart >= 0 && base32.length() % 8 != 0)) {
            throw new IllegalArgumentException("Invalid Base32 secret");
        }

        int outputLength = clean.length() * 5 / 8;
        byte[] result = new byte[outputLength];
        int buffer = 0;
        int bitsLeft = 0;
        int next = 0;
        for (char c : clean.toCharArray()) {
            int val = BASE32_CHARS.indexOf(c);
            buffer = (buffer << 5) | val;
            bitsLeft += 5;
            if (bitsLeft >= 8) {
                bitsLeft -= 8;
                result[next++] = (byte) ((buffer >> bitsLeft) & 0xff);
            }
        }
        if ((buffer & ((1 << bitsLeft) - 1)) != 0) {
            throw new IllegalArgumentException("Invalid Base32 secret");
        }
        return result;
    }
}
