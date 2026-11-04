package com.kuwy.helpdesk.services;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TwoFactorAuthServiceTest {

    // Public RFC 6238 SHA-1 test seed, not an application credential.
    private static final String SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    private static final String BACKUP_CODES = "4826-7319,9052-1648";

    private final TwoFactorAuthService service = new TwoFactorAuthService(
            Clock.fixed(Instant.ofEpochSecond(59), ZoneOffset.UTC));

    @ParameterizedTest
    @CsvSource({
            "59, 287082",
            "1111111109, 081804",
            "1111111111, 050471",
            "1234567890, 005924",
            "2000000000, 279037",
            "20000000000, 353130"
    })
    void acceptsRfc6238Sha1CodesWithSixDigits(long epochSeconds, String code) {
        TwoFactorAuthService verifier = new TwoFactorAuthService(
                Clock.fixed(Instant.ofEpochSecond(epochSeconds), ZoneOffset.UTC));

        assertTrue(verifier.verifyTotpCode(SECRET, code));
    }

    @Test
    void acceptsOnlyOneWindowOfClockDrift() {
        // RFC 4226 counters 0 and 2 surround the current counter 1.
        assertTrue(service.verifyTotpCode(SECRET, "755224"));
        assertTrue(service.verifyTotpCode(SECRET, "359152"));
        assertFalse(service.verifyTotpCode(SECRET, "969429"));

        TwoFactorAuthService later = new TwoFactorAuthService(
                Clock.fixed(Instant.ofEpochSecond(90), ZoneOffset.UTC));
        assertFalse(later.verifyTotpCode(SECRET, "287082"));
    }

    @Test
    void rejectsCodeForADifferentSecret() {
        assertFalse(service.verifyTotpCode("JBSWY3DPEHPK3PXP", "287082"));
    }

    @Test
    void acceptsLowercaseSecretAndSurroundingCodeWhitespace() {
        assertTrue(service.verifyTotpCode(SECRET.toLowerCase(Locale.ROOT), " 287082\t"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"123456", "000000", "999999"})
    void rejectsIncorrectSixDigitCodesWithOrWithoutASecret(String code) {
        assertFalse(service.verifyTotpCode(SECRET, code));
        assertFalse(service.verifyTotpCode(null, code));
        assertFalse(service.verifyTotpCode("", code));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "28708", "2870820", "28a082", "287 082", "287\t082",
            "+287082", "-287082", "\u0662\u0668\u0667\u0660\u0668\u0662"})
    void rejectsMalformedTotpCodes(String code) {
        assertFalse(service.verifyTotpCode(SECRET, code));
    }

    @Test
    void rejectsNullAndMalformedSecretsInsteadOfSilentlyCleaningThem() {
        for (String secret : new String[]{null, "", " ", "!!!", "A", "AAA", "AAAAAA",
                SECRET + "!", SECRET + "=", SECRET + "A", SECRET + "AB", " " + SECRET,
                SECRET.substring(0, 16) + " " + SECRET.substring(16)}) {
            assertFalse(service.verifyTotpCode(secret, "287082"));
        }
    }

    @Test
    void acceptsOnlyConfiguredBackupCodes() {
        assertTrue(service.verifyBackupCode(BACKUP_CODES, "4826-7319"));
        assertTrue(service.verifyBackupCode(BACKUP_CODES, "9052-1648"));
        assertTrue(service.verifyBackupCode(" 4826-7319 , 9052-1648 ", " 9052-1648\t"));
        assertFalse(service.verifyBackupCode(BACKUP_CODES, "3785-9264"));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "48267319", "4826-731", "4826-73190", "4826 -7319",
            "4826-73a9", "BACKUP-9999", "4826-7319,9052-1648"})
    void rejectsMalformedBackupCodesEvenIfStored(String code) {
        assertFalse(service.verifyBackupCode(BACKUP_CODES, code));
        assertFalse(service.verifyBackupCode(code, code));
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", ",", ", ,", "invalid"})
    void rejectsBackupCodesWithoutAConfiguredList(String configuredCodes) {
        assertFalse(service.verifyBackupCode(configuredCodes, "4826-7319"));
        assertFalse(service.verifyBackupCode(configuredCodes, "BACKUP-9999"));
    }

    @Test
    void consumedBackupCodeCannotBeReusedAndOtherCodesRemainAvailable() {
        assertTrue(service.verifyBackupCode(BACKUP_CODES, "4826-7319"));

        String remainingCodes = service.removeUsedBackupCode(BACKUP_CODES, " 4826-7319 ");

        assertEquals("9052-1648", remainingCodes);
        assertFalse(service.verifyBackupCode(remainingCodes, "4826-7319"));
        assertTrue(service.verifyBackupCode(remainingCodes, "9052-1648"));

        remainingCodes = service.removeUsedBackupCode(remainingCodes, "9052-1648");
        assertEquals("", remainingCodes);
        assertFalse(service.verifyBackupCode(remainingCodes, "9052-1648"));
    }

    @Test
    void consumingBackupCodeRemovesEveryDuplicate() {
        String remainingCodes = service.removeUsedBackupCode(
                "4826-7319,9052-1648, 4826-7319 ", "4826-7319");

        assertEquals("9052-1648", remainingCodes);
        assertFalse(service.verifyBackupCode(remainingCodes, "4826-7319"));
    }

    @Test
    void nullMalformedOrUnknownRemovalDoesNotConsumeOtherCodes() {
        assertEquals("", service.removeUsedBackupCode(null, null));
        assertEquals(BACKUP_CODES, service.removeUsedBackupCode(BACKUP_CODES, null));
        assertEquals(BACKUP_CODES, service.removeUsedBackupCode(BACKUP_CODES, ""));
        assertEquals(BACKUP_CODES, service.removeUsedBackupCode(BACKUP_CODES, "invalid"));
        assertEquals(BACKUP_CODES, service.removeUsedBackupCode(BACKUP_CODES, "3785-9264"));
    }
}
