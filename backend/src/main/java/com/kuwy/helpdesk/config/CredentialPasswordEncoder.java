package com.kuwy.helpdesk.config;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.Base64;

/** Supports existing bcrypt records while preventing truncation of new long passphrases. */
public final class CredentialPasswordEncoder implements PasswordEncoder {
    private static final String PREFIX = "{bcrypt-sha256}";
    private final BCryptPasswordEncoder bcrypt;

    public CredentialPasswordEncoder() {
        this(10);
    }

    CredentialPasswordEncoder(int strength) {
        bcrypt = new BCryptPasswordEncoder(strength);
    }

    @Override
    public String encode(CharSequence rawPassword) {
        validateInput(rawPassword);
        return PREFIX + bcrypt.encode(prehash(rawPassword));
    }

    @Override
    public boolean matches(CharSequence rawPassword, String encodedPassword) {
        if (rawPassword == null || rawPassword.length() == 0 || rawPassword.length() > 1024 || encodedPassword == null) return false;
        try {
            if (encodedPassword.startsWith(PREFIX)) {
                String hash = encodedPassword.substring(PREFIX.length());
                return isBcrypt(hash) && bcrypt.matches(prehash(rawPassword), hash);
            }
            byte[] legacy = rawPassword.toString().getBytes(StandardCharsets.UTF_8);
            try {
                return legacy.length <= 72 && isBcrypt(encodedPassword) && bcrypt.matches(rawPassword, encodedPassword);
            } finally {
                Arrays.fill(legacy, (byte) 0);
            }
        } catch (IllegalArgumentException malformed) {
            return false;
        }
    }

    @Override
    public boolean upgradeEncoding(String encodedPassword) {
        return encodedPassword != null && isBcrypt(encodedPassword);
    }

    private boolean isBcrypt(String value) {
        if (value == null || !value.matches("\\$2[aby]\\$[0-9]{2}\\$[./A-Za-z0-9]{53}")) return false;
        int cost = Integer.parseInt(value.substring(4, 6));
        return cost >= 4 && cost <= 16;
    }

    private String prehash(CharSequence raw) {
        byte[] input = raw.toString().getBytes(StandardCharsets.UTF_8);
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(input);
            try {
                return Base64.getEncoder().encodeToString(digest);
            } finally {
                Arrays.fill(digest, (byte) 0);
            }
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("Required password digest is unavailable.");
        } finally {
            Arrays.fill(input, (byte) 0);
        }
    }

    private void validateInput(CharSequence raw) {
        if (raw == null || raw.length() == 0 || raw.length() > 1024) {
            throw new IllegalArgumentException("Password length is invalid.");
        }
    }
}
