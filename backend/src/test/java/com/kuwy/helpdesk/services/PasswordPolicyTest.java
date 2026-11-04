package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.util.PasswordPolicy;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class PasswordPolicyTest {
    @Test
    void passphrasesDoNotRequireArbitraryCharacterClasses() {
        assertDoesNotThrow(() -> PasswordPolicy.validate("a sufficiently long passphrase"));
        assertDoesNotThrow(() -> PasswordPolicy.validate("phrase ".repeat(30)));
    }

    @Test
    void invalidAndCommonValuesAreRejected() {
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate(null));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate("short"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate(" ".repeat(15)));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate("password123"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate("a long phrase\nwith a newline"));
        assertThrows(IllegalArgumentException.class, () -> PasswordPolicy.validate("a".repeat(1025)));
    }
}
