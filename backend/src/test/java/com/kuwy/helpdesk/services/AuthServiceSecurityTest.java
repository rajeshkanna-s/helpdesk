package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.LoginRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.dto.Verify2FaRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AuthServiceSecurityTest {
    private static final String PASSWORD = "Synthetic test passphrase";
    private static final String SECRET = "JBSWY3DPEHPK3PXP";
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-04T06:00:00Z"), ZoneOffset.UTC);
    private UserRepository users;
    private CompanyRepository companies;
    private PasswordEncoder encoder;
    private JwtTokenProvider tokens;
    private TwoFactorAuthService factors;
    private SecurityAuditService audit;
    private RateLimiterService limiter;
    private SecretCryptoService crypto;
    private AuthService service;
    private User user;
    private Company company;
    private MockHttpServletRequest http;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        companies = mock(CompanyRepository.class);
        encoder = new BCryptPasswordEncoder(4);
        tokens = mock(JwtTokenProvider.class);
        factors = mock(TwoFactorAuthService.class);
        audit = mock(SecurityAuditService.class);
        limiter = mock(RateLimiterService.class);
        byte[] key = new byte[32];
        Arrays.fill(key, (byte) 23);
        crypto = new SecretCryptoService(Base64.getEncoder().encodeToString(key));
        service = new AuthService(users, companies, encoder, tokens, factors, audit, limiter, crypto);
        ReflectionTestUtils.setField(service, "clock", clock);
        company = new Company();
        company.setId(7L);
        company.setCompanyCode("TEST");
        company.setName("Synthetic Company");
        company.setSubdomain("synthetic");
        company.setStatus(Company.CompanyStatus.ACTIVE);
        Role role = new Role();
        role.setRoleType(Role.RoleType.AGENT);
        role.setName("Agent");
        user = new User();
        user.setId(11L);
        user.setCompany(company);
        user.setRole(role);
        user.setEmail("person@example.invalid");
        user.setDisplayName("Synthetic Person");
        user.setFirstName("Synthetic");
        user.setPasswordHash(encoder.encode(PASSWORD));
        http = new MockHttpServletRequest();
        http.setRemoteAddr("127.0.0.1");
        when(companies.findByCompanyCode("TEST")).thenReturn(Optional.of(company));
        when(users.findForAuthenticationByCompanyAndEmail(7L, user.getEmail())).thenReturn(Optional.of(user));
        when(users.findForAuthenticationByEmail(user.getEmail())).thenReturn(List.of(user));
        when(users.findForAuthenticationById(11L)).thenReturn(Optional.of(user));
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
        when(tokens.generateToken(user)).thenReturn("synthetic-signed-token");
        when(limiter.allowAuthentication(anyString(), anyString(), anyString())).thenReturn(true);
        when(factors.generateSecretKey()).thenReturn(SECRET);
        when(factors.getOtpAuthUrl(anyString(), anyString(), anyString())).thenReturn("otpauth://totp/synthetic");
        TenantContext.clear();
    }

    @AfterEach
    void clear() {
        TenantContext.clear();
    }

    @Test
    void onlyTheEncodedPasswordCanAuthenticate() {
        assertThrows(BadCredentialsException.class, () -> service.login(login("Password@123"), http));
        assertThrows(BadCredentialsException.class, () -> service.login(login(user.getPasswordHash()), http));
        assertThrows(BadCredentialsException.class, () -> service.login(login("not-the-password"), http));
        verify(tokens, never()).generateToken(any());
        assertEquals(3, user.getFailedLoginAttempts());
        assertEquals("synthetic-signed-token", service.login(login(PASSWORD), http).getToken());
        assertEquals(0, user.getFailedLoginAttempts());
    }

    @Test
    void failedAttemptsLockTheAccountAndUseCommitSafeExceptions() throws Exception {
        for (int i = 0; i < 4; i++) assertThrows(BadCredentialsException.class, () -> service.login(login("wrong"), http));
        assertThrows(LockedException.class, () -> service.login(login("wrong"), http));
        assertEquals(LocalDateTime.now(clock).plusMinutes(15), user.getLockoutUntil());
        assertThrows(LockedException.class, () -> service.login(login(PASSWORD), http));
        var attribute = new AnnotationTransactionAttributeSource().getTransactionAttribute(
                AuthService.class.getMethod("login", LoginRequest.class, jakarta.servlet.http.HttpServletRequest.class), AuthService.class);
        assertNotNull(attribute);
        assertFalse(attribute.rollbackOn(new BadCredentialsException("Synthetic failure")));
        assertTrue(attribute.rollbackOn(new IllegalStateException("Synthetic infrastructure failure")));
    }

    @Test
    void expiredLockoutAllowsCorrectCredentials() {
        user.setLockoutUntil(LocalDateTime.now(clock).minusSeconds(1));
        user.setFailedLoginAttempts(5);
        assertNotNull(service.login(login(PASSWORD), http).getToken());
        assertNull(user.getLockoutUntil());
    }

    @Test
    void rateLimitPreventsLookupAndTokenIssuance() {
        when(limiter.allowAuthentication(anyString(), anyString(), eq("login"))).thenReturn(false);
        assertThrows(LockedException.class, () -> service.login(login(PASSWORD), http));
        verifyNoInteractions(companies, users, tokens);
    }

    @Test
    void ambiguousGenericIdentityDoesNotSelectAnArbitraryWorkspace() {
        when(users.findForAuthenticationByEmail(user.getEmail())).thenReturn(List.of(user, new User()));
        LoginRequest request = login(PASSWORD);
        request.setCompanyCode(null);
        assertThrows(BadCredentialsException.class, () -> service.login(request, http));
        verify(tokens, never()).generateToken(any());
    }

    @Test
    void missingRoleOrDisabledAccountCannotReceiveAToken() {
        user.setRole(null);
        assertThrows(DisabledException.class, () -> service.login(login(PASSWORD), http));
        verify(tokens, never()).generateToken(any());
    }

    @Test
    void mfaChallengeRequiresPasswordAndIsSingleUse() {
        LoginResponse challenge = challenge();
        assertTrue(challenge.getTwoFactorRequired());
        assertNull(challenge.getToken());
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        assertNotNull(service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http).getToken());
        assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http));
        verify(tokens, times(1)).generateToken(user);
    }

    @Test
    void mfaChallengeExpiresAndLimitsWrongCodes() {
        LoginResponse challenge = challenge();
        for (int i = 0; i < 5; i++) {
            assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(challenge.getTempToken(), "000000", false), http));
        }
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http));
        LoginResponse next = challenge();
        ReflectionTestUtils.setField(service, "clock", Clock.offset(clock, java.time.Duration.ofSeconds(301)));
        assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(next.getTempToken(), "246810", false), http));
        verify(tokens, never()).generateToken(any());
    }

    @Test
    void securityChangesInvalidatePendingMfa() {
        LoginResponse challenge = challenge();
        user.invalidateAuthentication();
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http));
        verify(tokens, never()).generateToken(any());
    }

    @Test
    void disabledUserCannotFinishPendingMfa() {
        LoginResponse challenge = challenge();
        user.setIsActive(false);
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        assertThrows(DisabledException.class, () -> service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http));
        verify(tokens, never()).generateToken(any());
    }

    @Test
    void concurrentMfaReplayIssuesOnlyOneToken() throws Exception {
        LoginResponse challenge = challenge();
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        Callable<Boolean> attempt = () -> {
            try {
                return service.verify2Fa(verification(challenge.getTempToken(), "246810", false), http).getToken() != null;
            } catch (AuthenticationException expected) {
                return false;
            }
        };
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = executor.invokeAll(List.of(attempt, attempt));
            assertEquals(1, results.stream().filter(result -> {
                try { return result.get(); } catch (Exception failure) { throw new AssertionError(failure); }
            }).count());
        }
        verify(tokens, times(1)).generateToken(user);
    }

    @Test
    void anotherUsersMfaCannotBeManaged() {
        bindSelf();
        assertThrows(SecurityException.class, () -> service.setup2Fa(12L, PASSWORD, null, http));
        assertThrows(SecurityException.class, () -> service.enable2Fa(12L, "246810", http));
        assertThrows(SecurityException.class, () -> service.disable2Fa(12L, PASSWORD, "246810", http));
        verifyNoInteractions(factors);
    }

    @Test
    void setupRequiresCurrentPasswordAndKeepsTheSecretOffThirdPartyQrServices() {
        bindSelf();
        assertThrows(AuthenticationException.class, () -> service.setup2Fa(11L, "wrong", null, http));
        Map<String, Object> setup = service.setup2Fa(11L, PASSWORD, null, http);
        assertEquals(SECRET, setup.get("secret"));
        assertFalse(setup.containsKey("qrCodeUrl"));
        assertFalse(setup.containsKey("backupCodes"));
        assertNull(user.getTwoFactorSecret());
        assertFalse(user.getIsTwoFactorEnabled());
    }

    @Test
    void enableUsesServerEnrollmentAndStoresEncryptedSecretAndHashedRecoveryCodes() {
        bindSelf();
        assertThrows(AuthenticationException.class, () -> service.enable2Fa(11L, "246810", http));
        service.setup2Fa(11L, PASSWORD, null, http);
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        Map<String, Object> enabled = service.enable2Fa(11L, "246810", http);
        assertTrue(user.getIsTwoFactorEnabled());
        assertTrue(user.getTwoFactorSecret().startsWith("enc:v1:"));
        assertEquals(SECRET, crypto.decrypt(user.getTwoFactorSecret(), "staff-mfa:11"));
        assertEquals(1L, user.getAuthVersion());
        List<?> codes = (List<?>) enabled.get("backupCodes");
        assertEquals(10, codes.size());
        assertTrue(user.getBackupCodes().startsWith("BCRYPT_V1:"));
        String recovery = codes.getFirst().toString();
        assertFalse(user.getBackupCodes().contains(recovery));
        assertThrows(AuthenticationException.class, () -> service.enable2Fa(11L, "246810", http));

        LoginResponse first = service.login(login(PASSWORD), http);
        assertNotNull(service.verify2Fa(verification(first.getTempToken(), recovery, true), http).getToken());
        LoginResponse second = service.login(login(PASSWORD), http);
        assertThrows(AuthenticationException.class, () -> service.verify2Fa(verification(second.getTempToken(), recovery, true), http));
    }

    @Test
    void expiredEnrollmentCannotEnableMfa() {
        bindSelf();
        service.setup2Fa(11L, PASSWORD, null, http);
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        ReflectionTestUtils.setField(service, "clock", Clock.offset(clock, java.time.Duration.ofSeconds(301)));
        assertThrows(AuthenticationException.class, () -> service.enable2Fa(11L, "246810", http));
        assertFalse(user.getIsTwoFactorEnabled());
    }

    @Test
    void disablingRequiresCurrentPasswordAndFactorAndRevokesTokens() {
        bindSelf();
        user.setIsTwoFactorEnabled(true);
        user.setTwoFactorSecret(SECRET);
        assertThrows(AuthenticationException.class, () -> service.disable2Fa(11L, "wrong", "246810", http));
        assertThrows(AuthenticationException.class, () -> service.disable2Fa(11L, PASSWORD, "wrong", http));
        when(factors.verifyTotpCode(SECRET, "246810")).thenReturn(true);
        service.disable2Fa(11L, PASSWORD, "246810", http);
        assertFalse(user.getIsTwoFactorEnabled());
        assertNull(user.getTwoFactorSecret());
        assertNull(user.getBackupCodes());
        assertEquals(1L, user.getAuthVersion());
    }

    private LoginRequest login(String password) {
        LoginRequest request = new LoginRequest();
        request.setEmail(user.getEmail());
        request.setPassword(password);
        request.setCompanyCode("TEST");
        return request;
    }

    private LoginResponse challenge() {
        user.setIsTwoFactorEnabled(true);
        if (user.getTwoFactorSecret() == null) user.setTwoFactorSecret(SECRET);
        return service.login(login(PASSWORD), http);
    }

    private Verify2FaRequest verification(String token, String code, boolean backup) {
        Verify2FaRequest request = new Verify2FaRequest();
        request.setTempToken(token);
        request.setCode(code);
        request.setIsBackupCode(backup);
        return request;
    }

    private void bindSelf() {
        TenantContext.setContext(7L, 11L, "AGENT", user.getEmail());
    }
}
