package com.kuwy.helpdesk.util;

import java.util.Locale;
import java.util.Set;

public final class PasswordPolicy {
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "password123", "password1234", "password12345", "password@123",
            "1234567890", "12345678901", "qwerty12345", "admin12345",
            "admin@12345", "welcome1234", "letmein1234", "changeme123", "iloveyou123");

    private PasswordPolicy() {}

    public static void validate(String password) {
        if (password == null || password.isBlank() || password.codePointCount(0, password.length()) < 10 || password.length() > 1024) {
            throw new IllegalArgumentException("Use a password or passphrase with at least 10 characters (maximum 1024).");
        }
        if (password.codePoints().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("The password must not contain control characters.");
        }
        if (COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("This password is too common. Choose a different passphrase.");
        }
    }
}
