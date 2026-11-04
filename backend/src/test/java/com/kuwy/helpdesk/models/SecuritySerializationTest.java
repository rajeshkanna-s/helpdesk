package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class SecuritySerializationTest {
    @Test
    void rawUserGraphsNeverSerializeAuthenticationSecretsOrPrivateCompanySettings() throws Exception {
        Company company = new Company();
        company.setId(7L);
        company.setName("Synthetic Company");
        company.setSettingsJson("{\"privatePolicy\":\"synthetic\"}");
        User user = new User();
        user.setId(11L);
        user.setCompany(company);
        user.setEmail("person@example.invalid");
        user.setPasswordHash("synthetic-password-hash");
        user.setTwoFactorSecret("synthetic-mfa-secret");
        user.setBackupCodes("synthetic-backup-records");
        user.setFailedLoginAttempts(4);
        user.setLockoutUntil(LocalDateTime.of(2026, 11, 4, 6, 0));
        user.invalidateAuthentication();
        String json = new ObjectMapper().findAndRegisterModules().writeValueAsString(user);
        for (String name : new String[]{"passwordHash", "twoFactorSecret", "backupCodes", "failedLoginAttempts", "lockoutUntil", "authVersion", "rowVersion", "settingsJson"}) {
            assertFalse(json.contains('"' + name + '"'), name);
        }
        assertFalse(json.contains("synthetic-mfa-secret"));
        assertFalse(json.contains("privatePolicy"));
        assertTrue(json.contains("person@example.invalid"));
    }
}
