package com.kuwy.helpdesk.util;

import lombok.extern.slf4j.Slf4j;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * AES-256-GCM authenticated encryption utility for sensitive database values
 * (such as Microsoft 365 OAuth client secrets, 2FA recovery codes).
 */
@Slf4j
public final class EncryptionUtil {

    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH = 128;
    private static final int IV_LENGTH = 12;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private static final SecretKey MASTER_KEY;

    static {
        String envKey = System.getenv("KUWY_ENCRYPTION_KEY");
        if (envKey == null || envKey.isBlank()) {
            envKey = "KuwyHelpDeskEnterpriseSecretKey2026"; // Default runtime seed
        }
        try {
            byte[] keyBytes = MessageDigest.getInstance("SHA-256").digest(envKey.getBytes(StandardCharsets.UTF_8));
            MASTER_KEY = new SecretKeySpec(keyBytes, "AES");
        } catch (Exception e) {
            throw new RuntimeException("Failed to initialize cryptographic encryption key", e);
        }
    }

    private EncryptionUtil() {}

    public static String encrypt(String plainText) {
        if (plainText == null || plainText.isBlank()) {
            return plainText;
        }
        try {
            byte[] iv = new byte[IV_LENGTH];
            SECURE_RANDOM.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.ENCRYPT_MODE, MASTER_KEY, spec);

            byte[] cipherText = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));

            byte[] combined = new byte[iv.length + cipherText.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(cipherText, 0, combined, iv.length, cipherText.length);

            return "enc:" + Base64.getEncoder().encodeToString(combined);
        } catch (Exception e) {
            log.error("Encryption failure", e);
            throw new RuntimeException("Failed to securely encrypt sensitive value", e);
        }
    }

    public static String decrypt(String cipherText) {
        if (cipherText == null || !cipherText.startsWith("enc:")) {
            return cipherText; // Return as-is if unencrypted or legacy
        }
        try {
            byte[] combined = Base64.getDecoder().decode(cipherText.substring(4));

            byte[] iv = new byte[IV_LENGTH];
            System.arraycopy(combined, 0, iv, 0, IV_LENGTH);

            byte[] encrypted = new byte[combined.length - IV_LENGTH];
            System.arraycopy(combined, IV_LENGTH, encrypted, 0, encrypted.length);

            Cipher cipher = Cipher.getInstance(ALGORITHM);
            GCMParameterSpec spec = new GCMParameterSpec(GCM_TAG_LENGTH, iv);
            cipher.init(Cipher.DECRYPT_MODE, MASTER_KEY, spec);

            byte[] plainBytes = cipher.doFinal(encrypted);
            return new String(plainBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            log.error("Decryption failure", e);
            return "[Decryption error]";
        }
    }
}

