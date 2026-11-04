package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Version;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BrowserSessionServiceTest {
    private final BrowserSessionRepository sessions = mock(BrowserSessionRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final ContactRepository contacts = mock(ContactRepository.class);
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final JwtTokenProvider jwt = mock(JwtTokenProvider.class);
    private final SecretCryptoService crypto = new SecretCryptoService(Base64.getEncoder().encodeToString(new byte[32]));
    private final Map<UUID, BrowserSession> rows = new HashMap<>();
    private final Map<String, Claims> claims = new HashMap<>();
    private Clock clock = Clock.fixed(Instant.parse("2026-11-04T07:00:00Z"), ZoneOffset.UTC);
    private final Company company = new Company();
    private final User user = new User();
    private final Contact contact = new Contact();
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private BrowserSessionService service;

    @BeforeEach
    void setup() {
        company.setId(7L);
        Role role = new Role();
        role.setRoleType(Role.RoleType.AGENT);
        user.setId(11L); user.setCompany(company); user.setRole(role); user.setEmail("staff@example.invalid");
        contact.setId(21L); contact.setCompany(company); contact.setEmail("customer@example.invalid");
        contact.setIsPortalUser(true);
        request.setRemoteAddr("127.0.0.1");
        request.addHeader("User-Agent", "Synthetic Browser/1.0");
        request.addHeader("X-Forwarded-For", "203.0.113.99");
        when(users.findForAuthenticationById(11L)).thenReturn(Optional.of(user));
        when(users.findById(11L)).thenReturn(Optional.of(user));
        when(contacts.findById(21L)).thenReturn(Optional.of(contact));
        when(sessions.lockContact(21L)).thenReturn(Optional.of(contact));
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(sessions.save(any(BrowserSession.class))).thenAnswer(call -> {
            BrowserSession row = call.getArgument(0); rows.put(row.getId(), row); return row;
        });
        when(sessions.findForUpdate(any())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
        when(sessions.findById(any())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
        when(jwt.getClaimsFromToken(anyString())).thenAnswer(call -> claims.get(call.getArgument(0)));
        when(jwt.generateBrowserToken(anyString(), anyString(), anyLong(), anyLong(), anyString(), anyString(), anyLong(), anyLong()))
                .thenAnswer(call -> {
                    String token = "synthetic-access-" + UUID.randomUUID();
                    claims.put(token, Jwts.claims().subject(call.getArgument(4)).add("type", "BROWSER_SESSION")
                            .add("sid", call.getArgument(0)).add("kind", call.getArgument(1))
                            .add("subjectId", call.getArgument(2)).add("companyId", call.getArgument(3))
                            .add("role", call.getArgument(5)).add("authVersion", call.getArgument(6))
                            .expiration(Date.from(clock.instant().plusSeconds(call.getArgument(7)))).build());
                    return token;
                });
        service = newService();
    }

    @Test
    void opensFromVerifiedStaffIdentityWithOnlyHashAndBoundedDeviceMetadataPersisted() throws Exception {
        request.removeHeader("User-Agent"); request.addHeader("User-Agent", "Browser/" + "x".repeat(300));
        var tokens = staff(false);
        BrowserSession row = row(tokens);
        assertEquals(tokens.sessionId(), claims.get(tokens.accessToken()).get("sid"));
        verify(jwt).generateBrowserToken(tokens.sessionId(), "STAFF", 11L, 7L, user.getEmail(), "AGENT", 0L, 900L);
        assertEquals(80, tokens.refreshToken().length());
        assertEquals(32, Base64.getUrlDecoder().decode(tokens.refreshToken().substring(37)).length);
        assertEquals(hash(tokens.refreshToken()), row.getRefreshHash());
        assertEquals(tokens.csrfToken(), crypto.decrypt(row.getEncryptedCsrf(), "browser-session:" + tokens.sessionId()));
        assertThrows(IllegalArgumentException.class, () -> crypto.decrypt(row.getEncryptedCsrf(), "browser-session:other"));
        assertEquals(160, row.getDeviceLabel().length());
        assertEquals("127.0.0.1", row.getRemoteAddr());
        var mapper = new ObjectMapper().findAndRegisterModules();
        var json = mapper.valueToTree(row);
        assertFalse(json.has("refreshHash") || json.has("previousRefreshHash") || json.has("encryptedCsrf"));
        var tokenJson = mapper.valueToTree(tokens);
        assertFalse(tokenJson.has("accessToken") || tokenJson.has("refreshToken"));
        assertEquals("Tokens[redacted]", tokens.toString());
    }

    @ParameterizedTest
    @CsvSource({"AGENT,false,43200,1800", "AGENT,true,2592000,604800", "SUPER_ADMIN,true,28800,1800"})
    void staffLifetimePolicyIsCapturedAtOpen(String role, boolean remember, long absolute, long idle) {
        user.getRole().setRoleType(Role.RoleType.valueOf(role));
        if (role.equals("SUPER_ADMIN")) company.setStatus(Company.CompanyStatus.SUSPENDED);
        var tokens = staff(remember);
        assertEquals(900, tokens.accessMaxAge());
        assertEquals(absolute, tokens.refreshMaxAge());
        assertEquals(clock.instant().plusSeconds(idle), row(tokens).getIdleExpiresAt());
    }

    @Test
    void customerOpenReloadsVerifiedContactAndNeverUsesAStaffSubject() {
        var tokens = service.openCustomer(contact, request);
        assertEquals(30 * 86400L, tokens.refreshMaxAge());
        assertEquals(clock.instant().plusSeconds(7 * 86400L), row(tokens).getIdleExpiresAt());
        verify(jwt).generateBrowserToken(tokens.sessionId(), "CUSTOMER", 21L, 7L, contact.getEmail(), "CUSTOMER", 0L, 900L);
        verifyNoInteractions(users);
        Contact stale = new Contact();
        stale.setId(21L); stale.setCompany(company); stale.setEmail("someone-else@example.invalid"); stale.setIsPortalUser(true);
        assertThrows(AuthenticationException.class, () -> service.openCustomer(stale, request));
        contact.setIsPortalUser(false);
        assertThrows(AuthenticationException.class, () -> service.openCustomer(contact, request));
    }

    @Test
    void legacyExchangeRejectsCustomerAndStaleStaffClaims() {
        String legacy = legacy();
        user.setAuthVersion(1L);
        assertThrows(AuthenticationException.class, () -> service.openStaff(legacy, false, request));
        user.getRole().setRoleType(Role.RoleType.CUSTOMER);
        assertThrows(AuthenticationException.class, () -> service.openStaff(legacy(), false, request));
        assertThrows(AuthenticationException.class, () -> service.openStaff("not-a-signed-token", false, request));
        assertTrue(rows.isEmpty());
    }

    @Test
    void bootstrapSurvivesServiceRecreationWithoutRotationOrIdleExtension() {
        var tokens = staff(false);
        BrowserSession row = row(tokens);
        Instant seen = row.getLastSeenAt(), idle = row.getIdleExpiresAt();
        advance(100);
        service = newService();
        clearInvocations(sessions, jwt);
        var result = service.bootstrap(tokens.refreshToken(), "STAFF");
        assertEquals(Set.of("identity", "csrfToken"), result.keySet());
        assertEquals(tokens.csrfToken(), result.get("csrfToken"));
        assertEquals(11L, ((BrowserSessionService.Identity) result.get("identity")).subjectId());
        assertEquals(seen, row.getLastSeenAt()); assertEquals(idle, row.getIdleExpiresAt());
        assertNull(row.getPreviousRefreshHash());
        verify(sessions, never()).save(any()); verify(sessions, never()).findForUpdate(any()); verifyNoInteractions(jwt);
    }

    @Test
    void csrfIsRequiredForUnsafeAccessAndEveryRefreshWithoutChangingStateOnFailure() {
        var tokens = staff(false);
        Instant idle = row(tokens).getIdleExpiresAt();
        advance(60);
        assertThrows(SecurityException.class, () -> service.authenticate(tokens.accessToken(), "STAFF", null, true));
        assertThrows(SecurityException.class, () -> service.refresh(tokens.refreshToken(), "STAFF", "incorrect"));
        assertThrows(SecurityException.class, () -> service.refresh(tokens.refreshToken(), "STAFF", null));
        assertEquals(idle, row(tokens).getIdleExpiresAt());
        assertNotNull(service.authenticate(tokens.accessToken(), "STAFF", null, false));
        assertNotNull(service.authenticate(tokens.accessToken(), "STAFF", tokens.csrfToken(), true));
        assertEquals(idle.plusSeconds(60), row(tokens).getIdleExpiresAt());
    }

    @Test
    void refreshRotatesAndOnlyProvenImmediateReplayRevokesTheFamily() throws Exception {
        var first = staff(false);
        advance(60);
        var next = service.refresh(first.refreshToken(), "STAFF", first.csrfToken());
        BrowserSession row = row(first);
        assertNotEquals(first.refreshToken(), next.refreshToken());
        assertEquals(hash(first.refreshToken()), row.getPreviousRefreshHash());
        assertEquals(hash(next.refreshToken()), row.getRefreshHash());
        assertEquals(first.csrfToken(), next.csrfToken());
        assertEquals(43200 - 60, next.refreshMaxAge());
        assertThrows(AuthenticationException.class, () -> service.refresh(first.sessionId() + "." + "A".repeat(43), "STAFF", first.csrfToken()));
        assertThrows(AuthenticationException.class, () -> service.bootstrap(first.refreshToken(), "STAFF"));
        assertThrows(SecurityException.class, () -> service.refresh(first.refreshToken(), "STAFF", "incorrect"));
        assertNull(row.getRevokedAt());
        assertThrows(AuthenticationException.class, () -> service.refresh(first.refreshToken(), "STAFF", first.csrfToken()));
        assertEquals(clock.instant(), row.getRevokedAt());
        assertThrows(AuthenticationException.class, () -> service.authenticate(next.accessToken(), "STAFF", null, false));
        var method = BrowserSessionService.class.getMethod("refresh", String.class, String.class, String.class);
        var tx = new AnnotationTransactionAttributeSource().getTransactionAttribute(method, BrowserSessionService.class);
        assertNotNull(tx); assertFalse(tx.rollbackOn(new BadCredentialsException("test")));
        assertTrue(tx.rollbackOn(new IllegalStateException("test")));
        assertEquals(LockModeType.PESSIMISTIC_WRITE,
                BrowserSessionRepository.class.getMethod("findForUpdate", UUID.class).getAnnotation(Lock.class).value());
        assertNotNull(BrowserSession.class.getDeclaredField("rowVersion").getAnnotation(Version.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"type", "sid", "subjectId"})
    void missingBrowserClaimsNeverFallBackToLegacyAuthentication(String missing) {
        var tokens = staff(false);
        Map<String, Object> malformed = new HashMap<>(claims.get(tokens.accessToken()));
        malformed.remove(missing);
        claims.put("malformed", Jwts.claims().add(malformed).build());
        assertThrows(AuthenticationException.class, () -> service.authenticate("malformed", "STAFF", null, false));
        assertThrows(AuthenticationException.class, () -> service.authenticate(tokens.accessToken(), "CUSTOMER", null, false));
        assertThrows(AuthenticationException.class, () -> service.refresh(tokens.refreshToken(), "CUSTOMER", tokens.csrfToken()));
        assertThrows(AuthenticationException.class, () -> service.bootstrap(tokens.refreshToken(), "CUSTOMER"));
        assertNull(row(tokens).getRevokedAt());
    }

    @Test
    void signedClaimsCannotChangeTheSessionCompanyRoleOrNumericVersion() {
        var tokens = staff(false);
        Map.of("companyId", 8L, "role", "SUPER_ADMIN", "authVersion", 0.5).forEach((key, value) -> {
            Map<String, Object> changed = new HashMap<>(claims.get(tokens.accessToken()));
            changed.put(key, value);
            claims.put("changed", Jwts.claims().add(changed).build());
            assertThrows(AuthenticationException.class, () -> service.authenticate("changed", "STAFF", null, false));
        });
        assertNull(row(tokens).getRevokedAt());
    }

    @ParameterizedTest
    @ValueSource(strings = {"role", "company", "email", "version", "disabled"})
    void currentStaffIdentityMustMatchOnEveryUse(String change) {
        var tokens = staff(false);
        switch (change) {
            case "role" -> user.getRole().setRoleType(Role.RoleType.SUPER_ADMIN);
            case "company" -> { Company other = new Company(); other.setId(8L); user.setCompany(other); }
            case "email" -> user.setEmail("changed@example.invalid");
            case "version" -> user.setAuthVersion(1L);
            case "disabled" -> user.setIsActive(false);
        }
        assertRejectedEverywhere(tokens, "STAFF");
    }

    @Test
    void customerBlockingVersionChangesAndCompanySuspensionInvalidateSessions() {
        var tokens = service.openCustomer(contact, request);
        contact.setIsBlocked(true); assertRejectedEverywhere(tokens, "CUSTOMER");
        contact.setIsBlocked(false); contact.setAuthVersion(1L); assertRejectedEverywhere(tokens, "CUSTOMER");
        contact.setAuthVersion(0L); company.setStatus(Company.CompanyStatus.INACTIVE); assertRejectedEverywhere(tokens, "CUSTOMER");
    }

    @ParameterizedTest
    @ValueSource(strings = {"idle", "absolute", "access"})
    void exactExpiryBoundaryIsRejected(String expiry) {
        var tokens = staff(false);
        BrowserSession row = row(tokens);
        if (expiry.equals("idle")) row.setIdleExpiresAt(clock.instant());
        else if (expiry.equals("absolute")) row.setAbsoluteExpiresAt(clock.instant());
        else advance(900);
        assertThrows(AuthenticationException.class, () -> service.authenticate(tokens.accessToken(), "STAFF", null, false));
        if (!expiry.equals("access")) assertRejectedEverywhere(tokens, "STAFF");
        else assertNotNull(service.refresh(tokens.refreshToken(), "STAFF", tokens.csrfToken()));
    }

    @Test
    void repeatedRefreshCannotExtendTheAbsoluteDeadline() {
        var tokens = staff(false);
        BrowserSession row = row(tokens);
        row.setLastSeenAt(row.getAbsoluteExpiresAt().minusSeconds(1800));
        row.setIdleExpiresAt(row.getAbsoluteExpiresAt());
        advance(43200 - 30);
        var next = service.refresh(tokens.refreshToken(), "STAFF", tokens.csrfToken());
        assertEquals(30, next.accessMaxAge());
        advance(29);
        var last = service.refresh(next.refreshToken(), "STAFF", next.csrfToken());
        assertEquals(1, last.accessMaxAge());
        assertEquals(row.getAbsoluteExpiresAt(), row.getIdleExpiresAt());
        advance(1);
        assertRejectedEverywhere(last, "STAFF");
    }

    @Test
    void capEvictsOldestUnderSubjectLockAndListingAndRevocationStayOwnerScoped() {
        List<BrowserSession> older = IntStream.range(0, 10).mapToObj(i -> {
            BrowserSession row = new BrowserSession(); row.setId(UUID.randomUUID()); return row;
        }).toList();
        when(sessions.findActiveForUpdate(11L, "STAFF", clock.instant(), PageRequest.of(0, 10))).thenReturn(older);
        var tokens = staff(false);
        assertNotNull(older.get(0).getRevokedAt());
        assertTrue(older.subList(1, 10).stream().allMatch(s -> s.getRevokedAt() == null));
        var order = inOrder(users, sessions);
        order.verify(users).findForAuthenticationById(11L);
        order.verify(sessions).findActiveForUpdate(11L, "STAFF", clock.instant(), PageRequest.of(0, 10));
        when(sessions.findActive(11L, "STAFF", clock.instant(), PageRequest.of(0, 10))).thenReturn(List.of(row(tokens)));
        Map<String, Object> metadata = service.listActive(11L, "STAFF", tokens.sessionId()).get(0);
        assertEquals(true, metadata.get("current"));
        assertEquals(Set.of("sessionId", "kind", "deviceLabel", "remoteAddr", "createdAt", "lastSeenAt",
                "absoluteExpiresAt", "idleExpiresAt", "current"), metadata.keySet());
        assertTrue(service.listActive(99L, "STAFF", tokens.sessionId()).isEmpty());
        assertThrows(AuthenticationException.class, () -> service.revoke(tokens.sessionId(), 99L, "STAFF"));
        assertThrows(AuthenticationException.class, () -> service.revoke(tokens.sessionId(), 11L, "CUSTOMER"));
        assertNull(row(tokens).getRevokedAt());
        service.revoke(tokens.sessionId(), 11L, "STAFF");
        assertNotNull(row(tokens).getRevokedAt());
        var another = staff(false);
        when(sessions.findUnrevokedForUpdate(11L, "STAFF", PageRequest.of(0, 100))).thenReturn(List.of(row(another)));
        service.revokeAll(11L, "STAFF");
        assertNotNull(row(another).getRevokedAt()); verify(sessions).flush();
        service.revoke(tokens.sessionId(), 11L, "STAFF");
    }

    @Test
    void missingEncryptionAndCorruptCiphertextFailClosed() {
        var tokens = staff(false);
        row(tokens).setEncryptedCsrf("invalid");
        assertRejectedEverywhere(tokens, "STAFF");
        service = new BrowserSessionService(sessions, users, contacts, companies, jwt, new SecretCryptoService(""));
        assertThrows(AuthenticationException.class, () -> service.openStaff(legacy(), false, request));
        assertRejectedEverywhere(tokens, "STAFF");
    }

    private BrowserSessionService newService() {
        var result = new BrowserSessionService(sessions, users, contacts, companies, jwt, crypto);
        ReflectionTestUtils.setField(result, "clock", clock);
        return result;
    }
    private String legacy() {
        claims.put("legacy", Jwts.claims().subject(user.getEmail()).add("type", "STAFF").add("userId", user.getId())
                .add("companyId", user.getCompany().getId()).add("role", user.getRole().getRoleType().name())
                .add("authVersion", user.getAuthVersion()).expiration(Date.from(clock.instant().plusSeconds(3600))).build());
        return "legacy";
    }
    private BrowserSessionService.Tokens staff(boolean remember) { return service.openStaff(legacy(), remember, request); }
    private BrowserSession row(BrowserSessionService.Tokens tokens) { return rows.get(UUID.fromString(tokens.sessionId())); }
    private void advance(long seconds) { clock = Clock.offset(clock, Duration.ofSeconds(seconds)); ReflectionTestUtils.setField(service, "clock", clock); }
    private String hash(String value) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
    private void assertRejectedEverywhere(BrowserSessionService.Tokens tokens, String kind) {
        assertThrows(AuthenticationException.class, () -> service.authenticate(tokens.accessToken(), kind, null, false));
        assertThrows(AuthenticationException.class, () -> service.refresh(tokens.refreshToken(), kind, tokens.csrfToken()));
        assertThrows(AuthenticationException.class, () -> service.bootstrap(tokens.refreshToken(), kind));
    }
}
