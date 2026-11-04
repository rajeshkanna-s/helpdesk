package com.kuwy.helpdesk.services;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.PasswordResetToken;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.PasswordResetTokenRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PasswordResetServiceSecurityTest {
    private static final String EMAIL = "agent@example.invalid";
    private static final String RAW_TOKEN = "a1".repeat(32);
    private static final String PASSPHRASE = "orchards beside quiet rivers";
    private PasswordResetTokenRepository tokens;
    private UserRepository users;
    private CompanyRepository companies;
    private PasswordEncoder passwords;
    private SecurityAuditService audits;
    private AccountEmailService emails;
    private RateLimiterService rates;
    private PasswordResetService service;
    private Company company;
    private User user;
    private MockHttpServletRequest http;

    @BeforeEach
    void setUp() {
        tokens = mock(PasswordResetTokenRepository.class);
        users = mock(UserRepository.class);
        companies = mock(CompanyRepository.class);
        passwords = mock(PasswordEncoder.class);
        audits = mock(SecurityAuditService.class);
        emails = mock(AccountEmailService.class);
        rates = mock(RateLimiterService.class);
        service = new PasswordResetService(tokens, users, companies, passwords, audits, emails, rates);
        ReflectionTestUtils.setField(service, "frontendUrl", "https://desk.example.invalid/support&tools/");
        http = new MockHttpServletRequest();
        http.setRemoteAddr("192.0.2.10");
        http.addHeader("Host", "attacker.example.invalid");
        http.addHeader("X-Forwarded-For", "198.51.100.99");

        company = new Company();
        company.setId(7L);
        company.setCompanyCode("KUWY");
        Role role = new Role();
        role.setId(2L);
        role.setRoleType(Role.RoleType.AGENT);
        role.setIsSystemRole(true);
        user = new User();
        user.setId(44L);
        user.setCompany(company);
        user.setEmail(EMAIL);
        user.setRole(role);
        user.setPasswordHash("old-encoded-password");
        user.setAuthVersion(4L);

        when(companies.findByCompanyCode("KUWY")).thenReturn(Optional.of(company));
        when(users.findForAuthenticationByCompanyAndEmail(7L, EMAIL)).thenReturn(Optional.of(user));
        when(users.findForAuthenticationByEmail(EMAIL)).thenReturn(List.of(user));
        when(users.findForAuthenticationById(44L)).thenReturn(Optional.of(user));
        when(users.findById(44L)).thenReturn(Optional.of(user));
        when(rates.allowAuthentication(any(), anyString(), eq("password-reset-request"))).thenReturn(true);
        when(passwords.encode(anyString())).thenReturn("new-encoded-password");
        AtomicLong nextId = new AtomicLong(100);
        when(tokens.save(any(PasswordResetToken.class))).thenAnswer(call -> {
            PasswordResetToken token = call.getArgument(0);
            if (token.getId() == null) token.setId(nextId.incrementAndGet());
            return token;
        });
    }

    @Test
    void knownAndUnknownAccountsReturnTheSameConfirmationAndOnlyQueueTheKnownAccount() throws Exception {
        PasswordResetToken old = token();
        when(tokens.findByUserIdAndIsUsedFalse(44L)).thenReturn(List.of(old));
        Logger logger = (Logger) LoggerFactory.getLogger(PasswordResetService.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            Map<String, Object> known = service.requestPasswordReset(forgot(" AGENT@EXAMPLE.INVALID "), http);
            Map<String, Object> unknown = service.requestPasswordReset(forgot("missing@example.invalid"), http);
            assertEquals(known, unknown);
            assertEquals(Set.of("success", "message"), known.keySet());
            assertEquals(true, known.get("success"));
            assertTrue(known.get("message").toString().contains("queued"));
            assertFalse(known.get("message").toString().contains("sent"));
            assertTrue(old.getIsUsed());

            ArgumentCaptor<PasswordResetToken> saved = ArgumentCaptor.forClass(PasswordResetToken.class);
            ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
            verify(tokens).save(saved.capture());
            verify(emails).enqueue(eq(7L), eq(EMAIL), eq("Reset your Helpdesk password"), html.capture(), key.capture());
            String raw = extractToken(html.getValue());
            assertEquals(hash(raw), saved.getValue().getTokenHash());
            assertNotEquals(raw, saved.getValue().getTokenHash());
            assertEquals(7L, saved.getValue().getCompanyId());
            assertEquals(44L, saved.getValue().getUserId());
            assertEquals(EMAIL, saved.getValue().getEmail());
            assertFalse(saved.getValue().getIsUsed());
            assertTrue(saved.getValue().getExpiresAt().isAfter(LocalDateTime.now().plusMinutes(59)));
            assertTrue(saved.getValue().getExpiresAt().isBefore(LocalDateTime.now().plusHours(1).plusSeconds(1)));
            assertTrue(html.getValue().contains("https://desk.example.invalid/support&amp;tools/reset-password#token=" + raw));
            assertFalse(html.getValue().contains("attacker.example.invalid"));
            assertEquals("password-reset:44:101", key.getValue());
            assertFalse(key.getValue().contains(raw));
            assertFalse(key.getValue().contains(saved.getValue().getTokenHash()));
            assertFalse(known.toString().contains(raw));
            assertFalse(known.toString().contains(saved.getValue().getTokenHash()));
            assertTrue(logs.list.stream().noneMatch(event -> event.getFormattedMessage().contains(raw)
                    || event.getFormattedMessage().contains("reset-password#token=")));
            verify(audits).recordEvent(eq(7L), isNull(), eq("PASSWORD_RESET_REQUESTED"), eq(EMAIL),
                    eq("Password reset email queued; link valid for one hour."), same(http));
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void readinessAndRateChecksPrecedeAnyAccountLookupAndUseTheSocketAddress() {
        service.requestPasswordReset(forgot(EMAIL), http);
        var order = inOrder(emails, rates, companies, users, tokens);
        order.verify(emails).requireReady();
        order.verify(rates).allowAuthentication("192.0.2.10", "KUWY:" + EMAIL, "password-reset-request");
        order.verify(companies).findByCompanyCode("KUWY");
        order.verify(users).findForAuthenticationByCompanyAndEmail(7L, EMAIL);
        order.verify(tokens).findByUserIdAndIsUsedFalse(44L);
        order.verify(tokens).saveAll(anyList());
        order.verify(tokens).save(any(PasswordResetToken.class));
        order.verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {EMAIL, "missing@example.invalid"})
    void unavailableEmailFailsBeforeEitherKnownOrUnknownAccountLookup(String email) {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_NOT_READY")).when(emails).requireReady();
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.requestPasswordReset(forgot(email), http));
        assertEquals("ACCOUNT_EMAIL_NOT_READY", error.getMessage());
        verifyNoInteractions(tokens, users, companies, passwords, audits, rates);
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {EMAIL, "missing@example.invalid"})
    void rateRejectionFailsBeforeAccountLookup(String email) {
        when(rates.allowAuthentication(any(), anyString(), anyString())).thenReturn(false);
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.requestPasswordReset(forgot(email), http));
        assertEquals("PASSWORD_RESET_RATE_LIMITED", error.getMessage());
        verifyNoInteractions(tokens, users, companies, passwords, audits);
        verify(emails).requireReady();
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"/relative", "javascript:alert(1)", "https://name@example.invalid", "https://example.invalid?redirect=bad",
            "https://example.invalid/#fragment", "https://example.invalid:0", "https://example.invalid:99999",
            "https://example.invalid/../other", "https://example.invalid/%0aheader", "//example.invalid"})
    void invalidFrontendConfigurationFailsIndependentlyOfAccountExistence(String base) {
        ReflectionTestUtils.setField(service, "frontendUrl", base);
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.requestPasswordReset(forgot(EMAIL), http));
        assertEquals("ACCOUNT_EMAIL_NOT_READY", error.getMessage());
        assertNull(error.getCause());
        verifyNoInteractions(tokens, users, companies, passwords, audits);
    }

    @Test
    void queueFailurePropagatesWithoutAnAuditOrSuccessResponse() {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED")).when(emails)
                .enqueue(any(), anyString(), anyString(), anyString(), anyString());
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.requestPasswordReset(forgot(EMAIL), http));
        assertEquals("ACCOUNT_EMAIL_ENQUEUE_FAILED", error.getMessage());
        verify(tokens).save(any(PasswordResetToken.class));
        verifyNoInteractions(audits, passwords);
    }

    @Test
    void missingWorkspaceOrAmbiguousGlobalEmailNeverSelectsAnotherTenantIdentity() {
        Map<String, Object> missing = service.requestPasswordReset(forgot("missing@example.invalid"), http);
        ForgotPasswordRequest global = forgot(EMAIL);
        global.setCompanyCode(null);
        User otherTenant = new User();
        when(users.findForAuthenticationByEmail(EMAIL)).thenReturn(List.of(user, otherTenant));
        assertEquals(missing, service.requestPasswordReset(global, http));
        ForgotPasswordRequest wrongWorkspace = forgot(EMAIL);
        wrongWorkspace.setCompanyCode("NO_SUCH_WORKSPACE");
        assertEquals(missing, service.requestPasswordReset(wrongWorkspace, http));
        verifyNoInteractions(tokens, passwords, audits);
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verify(users, never()).findByEmail(anyString());
    }

    @Test
    void anUnambiguousGlobalAccountUsesTheAuthenticationLock() {
        ForgotPasswordRequest global = forgot(EMAIL);
        global.setCompanyCode(null);
        assertEquals(true, service.requestPasswordReset(global, http).get("success"));
        verify(users).findForAuthenticationByEmail(EMAIL);
        verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), anyString(), eq("password-reset:44:101"));
        verifyNoInteractions(companies);
    }

    @ParameterizedTest
    @ValueSource(strings = {"inactive", "inactive-status", "missing-status", "customer", "foreign-role", "unowned-global-role",
            "suspended-company", "inactive-company", "missing-company", "invalid-email"})
    void ineligibleAccountsCannotRequestValidateOrConsumeAReset(String state) {
        switch (state) {
            case "inactive" -> user.setIsActive(false);
            case "inactive-status" -> user.setStatus("INACTIVE");
            case "missing-status" -> user.setStatus(null);
            case "customer" -> user.getRole().setRoleType(Role.RoleType.CUSTOMER);
            case "foreign-role" -> {
                Company foreign = new Company();
                foreign.setId(8L);
                user.getRole().setCompany(foreign);
            }
            case "unowned-global-role" -> user.getRole().setIsSystemRole(false);
            case "suspended-company" -> company.setStatus(Company.CompanyStatus.SUSPENDED);
            case "inactive-company" -> company.setStatus(Company.CompanyStatus.INACTIVE);
            case "missing-company" -> user.setCompany(null);
            case "invalid-email" -> user.setEmail("Display <agent@example.invalid>");
            default -> fail("Unknown fixture");
        }
        PasswordResetToken token = installToken();
        assertEquals(true, service.requestPasswordReset(forgot(EMAIL), http).get("success"));
        assertEquals(false, service.validateResetToken(RAW_TOKEN).get("valid"));
        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(reset(RAW_TOKEN), http));
        assertFalse(token.getIsUsed());
        assertEquals("old-encoded-password", user.getPasswordHash());
        assertEquals(4L, user.getAuthVersion());
        verify(users, never()).save(any(User.class));
        verify(tokens, never()).save(any(PasswordResetToken.class));
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(passwords, audits);
    }

    @Test
    void publicValidationUsesANonlockingLookupAndReturnsOnlyNecessaryFields() {
        PasswordResetToken token = installToken();
        Map<String, Object> result = service.validateResetToken(RAW_TOKEN);
        assertEquals(Map.of("valid", true, "status", "VALID", "email", "a***t@example.invalid"), result);
        assertFalse(result.toString().contains(token.getTokenHash()));
        assertFalse(result.toString().contains(RAW_TOKEN));
        verify(tokens).findByTokenHash(hash(RAW_TOKEN));
        verify(tokens, never()).findForConsumptionByTokenHash(anyString());
        verify(users, never()).findForAuthenticationById(anyLong());
        verifyNoInteractions(passwords, emails, audits);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "short", "not-a-token", "G1G1G1", "<script>"})
    void malformedTokensNeverReachARepository(String raw) {
        assertEquals(false, service.validateResetToken(raw).get("valid"));
        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(reset(raw), http));
        verifyNoInteractions(tokens, users, companies, passwords, emails, audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {"used", "missing-used", "expired", "missing-expiry", "wrong-company", "wrong-email", "wrong-user", "wrong-hash"})
    void consumptionChecksAllLockedTokenAndIdentityFieldsBeforeWriting(String state) {
        PasswordResetToken token = installToken();
        switch (state) {
            case "used" -> token.setIsUsed(true);
            case "missing-used" -> token.setIsUsed(null);
            case "expired" -> token.setExpiresAt(LocalDateTime.now().minusNanos(1));
            case "missing-expiry" -> token.setExpiresAt(null);
            case "wrong-company" -> token.setCompanyId(8L);
            case "wrong-email" -> token.setEmail("other@example.invalid");
            case "wrong-user" -> token.setUserId(45L);
            case "wrong-hash" -> token.setTokenHash(hash("another token"));
            default -> fail("Unknown fixture");
        }
        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(reset(RAW_TOKEN), http));
        assertEquals("old-encoded-password", user.getPasswordHash());
        assertEquals(4L, user.getAuthVersion());
        verify(tokens).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        verify(tokens, never()).save(any(PasswordResetToken.class));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(passwords, audits, emails);
    }

    @Test
    void validResetLocksUserThenTokenRevokesSessionsAndDoesNotLoginOrReactivate() {
        PasswordResetToken token = installToken();
        PasswordResetToken other = token();
        other.setId(99L);
        when(tokens.findByUserIdAndIsUsedFalse(44L)).thenReturn(List.of(other));
        user.setFailedLoginAttempts(5);
        user.setLockoutUntil(LocalDateTime.now().plusHours(1));
        user.setIsTwoFactorEnabled(true);
        Map<String, Object> result = service.resetPassword(reset(RAW_TOKEN), http);

        var order = inOrder(tokens, users, passwords);
        order.verify(tokens).findUserIdByTokenHash(hash(RAW_TOKEN));
        order.verify(users).findForAuthenticationById(44L);
        order.verify(tokens).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        order.verify(passwords).encode(PASSPHRASE);
        order.verify(users).save(user);
        order.verify(tokens).save(token);
        assertEquals("new-encoded-password", user.getPasswordHash());
        assertEquals(5L, user.getAuthVersion());
        assertEquals(0, user.getFailedLoginAttempts());
        assertNull(user.getLockoutUntil());
        assertTrue(user.getIsActive());
        assertEquals("ACTIVE", user.getStatus());
        assertTrue(user.getIsTwoFactorEnabled());
        assertNull(user.getLastLoginAt());
        assertTrue(token.getIsUsed());
        assertTrue(other.getIsUsed());
        assertEquals(Set.of("success", "message"), result.keySet());
        assertEquals(true, result.get("success"));
        assertFalse(result.toString().contains(RAW_TOKEN));
        verifyNoInteractions(emails);

        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(reset(RAW_TOKEN), http));
        verify(passwords, times(1)).encode(PASSPHRASE);
        assertEquals(5L, user.getAuthVersion());
    }

    @Test
    void aTokenInvalidatedWhileWaitingForTheUserLockCannotBeConsumed() {
        PasswordResetToken token = installToken();
        when(users.findForAuthenticationById(44L)).thenAnswer(call -> {
            token.setIsUsed(true);
            return Optional.of(user);
        });
        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(reset(RAW_TOKEN), http));
        verify(tokens).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        verifyNoInteractions(passwords, emails, audits);
        verify(users, never()).save(any(User.class));
    }

    @Test
    void longPassphrasesArePassedUnmodifiedToTheInjectedEncoder() {
        installToken();
        ResetPasswordRequest request = reset(RAW_TOKEN);
        String password = "orchard ".repeat(128);
        assertEquals(1024, password.length());
        request.setNewPassword(password);
        assertEquals(true, service.resetPassword(request, http).get("success"));
        verify(passwords).encode(password);
    }

    @Test
    void oversizedPasswordsAreRejectedBeforeTokenLookup() {
        ResetPasswordRequest request = reset(RAW_TOKEN);
        request.setNewPassword("x".repeat(1025));
        assertThrows(IllegalArgumentException.class, () -> service.resetPassword(request, http));
        verifyNoInteractions(tokens, users, companies, passwords, emails, audits);
    }

    private ForgotPasswordRequest forgot(String email) {
        ForgotPasswordRequest request = new ForgotPasswordRequest();
        request.setEmail(email);
        request.setCompanyCode(" kuwy ");
        return request;
    }

    private ResetPasswordRequest reset(String raw) {
        ResetPasswordRequest request = new ResetPasswordRequest();
        request.setToken(raw);
        request.setNewPassword(PASSPHRASE);
        return request;
    }

    private PasswordResetToken token() {
        PasswordResetToken token = new PasswordResetToken();
        token.setId(90L);
        token.setUserId(44L);
        token.setCompanyId(7L);
        token.setEmail(EMAIL);
        token.setTokenHash(hash(RAW_TOKEN));
        token.setExpiresAt(LocalDateTime.now().plusHours(1));
        token.setIsUsed(false);
        return token;
    }

    private PasswordResetToken installToken() {
        PasswordResetToken token = token();
        when(tokens.findByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(token));
        when(tokens.findUserIdByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(44L));
        when(tokens.findForConsumptionByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(token));
        return token;
    }

    private static String extractToken(String html) {
        Matcher matcher = Pattern.compile("token=([0-9a-f]{64})").matcher(html);
        assertTrue(matcher.find());
        return matcher.group(1);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception unavailable) {
            throw new AssertionError(unavailable);
        }
    }
}
