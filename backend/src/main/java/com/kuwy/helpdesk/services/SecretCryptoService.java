package com.kuwy.helpdesk.services;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Service
public class SecretCryptoService {
    private static final String PREFIX = "enc:v1:";
    private static final int MAX_BYTES = 1024 * 1024;
    private final SecureRandom random = new SecureRandom();
    private final SecretKeySpec key;

    public SecretCryptoService(@Value("${kuwy.security.encryption-key:}") String encodedKey) {
        if (encodedKey == null || encodedKey.isBlank()) {
            key = null;
            return;
        }
        byte[] decoded;
        try {
            decoded = Base64.getDecoder().decode(encodedKey.trim());
        } catch (IllegalArgumentException invalid) {
            throw new IllegalStateException("The configured encryption key must be Base64 encoded.");
        }
        if (decoded.length != 32) throw new IllegalStateException("A 256-bit encryption key is required.");
        key = new SecretKeySpec(decoded, "AES");
        Arrays.fill(decoded, (byte) 0);
    }

    public boolean isConfigured() {
        return key != null;
    }

    public String encrypt(String plaintext, String purpose) {
        requireConfiguration(purpose);
        if (plaintext == null) throw new IllegalArgumentException("Secret data is required.");
        byte[] input = plaintext.getBytes(StandardCharsets.UTF_8);
        if (input.length > MAX_BYTES) throw new IllegalArgumentException("Secret data is too large.");
        byte[] nonce = new byte[12];
        random.nextBytes(nonce);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, nonce));
            cipher.updateAAD(purpose.getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(input);
            byte[] result = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, result, nonce.length, encrypted.length);
            return PREFIX + Base64.getEncoder().encodeToString(result);
        } catch (GeneralSecurityException unavailable) {
            throw new IllegalStateException("Secret encryption is unavailable.");
        } finally {
            Arrays.fill(input, (byte) 0);
        }
    }

    public String decrypt(String encoded, String purpose) {
        requireConfiguration(purpose);
        if (encoded == null || !encoded.startsWith(PREFIX) || encoded.length() > MAX_BYTES * 2) {
            throw new IllegalArgumentException("Encrypted secret data is invalid.");
        }
        try {
            byte[] data = Base64.getDecoder().decode(encoded.substring(PREFIX.length()));
            if (data.length < 28 || data.length > MAX_BYTES + 28) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, data, 0, 12));
            cipher.updateAAD(purpose.getBytes(StandardCharsets.UTF_8));
            byte[] plaintext = cipher.doFinal(data, 12, data.length - 12);
            try {
                return new String(plaintext, StandardCharsets.UTF_8);
            } finally {
                Arrays.fill(plaintext, (byte) 0);
            }
        } catch (GeneralSecurityException | IllegalArgumentException invalid) {
            throw new IllegalArgumentException("Encrypted secret data could not be verified.");
        }
    }

    private void requireConfiguration(String purpose) {
        if (key == null) throw new IllegalStateException("Secret encryption is not configured.");
        if (purpose == null || purpose.isBlank() || purpose.length() > 256) {
            throw new IllegalArgumentException("A valid encryption purpose is required.");
        }
    }
}
