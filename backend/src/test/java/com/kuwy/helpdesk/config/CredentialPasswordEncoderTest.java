package com.kuwy.helpdesk.config;

import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import static org.junit.jupiter.api.Assertions.*;

class CredentialPasswordEncoderTest {
    private final CredentialPasswordEncoder encoder = new CredentialPasswordEncoder(4);

    @Test
    void newHashesSupportLongPassphrasesWithoutBcryptTruncation() {
        String prefix = "long synthetic phrase ".repeat(8);
        String first = prefix + " first ending";
        String second = prefix + " different ending";
        String encoded = encoder.encode(first);
        assertTrue(encoded.startsWith("{bcrypt-sha256}"));
        assertTrue(encoder.matches(first, encoded));
        assertFalse(encoder.matches(second, encoded));
        assertFalse(encoder.matches(encoded, encoded));
    }

    @Test
    void legacyBcryptRecordsStillRequireTheirActualPassword() {
        String password = "Synthetic legacy passphrase";
        String legacy = new BCryptPasswordEncoder(4).encode(password);
        assertTrue(encoder.matches(password, legacy));
        assertTrue(encoder.upgradeEncoding(legacy));
        assertFalse(encoder.matches(legacy, legacy));
        assertFalse(encoder.matches("wrong", legacy));
        assertFalse(encoder.matches("a".repeat(73), legacy));
    }

    @Test
    void malformedAndPlaintextStoredValuesAreNeverCredentials() {
        assertFalse(encoder.matches("plaintext", "plaintext"));
        assertFalse(encoder.matches(null, "anything"));
        assertFalse(encoder.matches("anything", null));
        assertFalse(encoder.matches("anything", "{bcrypt-sha256}invalid"));
        assertThrows(IllegalArgumentException.class, () -> encoder.encode(""));
        assertThrows(IllegalArgumentException.class, () -> encoder.encode("a".repeat(1025)));
    }

    @Test
    void whitespaceAndUnicodeRemainPartOfThePassword() {
        String value = "  synthetic phrase \u03bb\u03b4  ";
        String encoded = encoder.encode(value);
        assertTrue(encoder.matches(value, encoded));
        assertFalse(encoder.matches(value.trim(), encoded));
        assertFalse(encoder.upgradeEncoding(encoded));
    }
}
