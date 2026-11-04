package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import com.kuwy.helpdesk.tenant.TenantFilter;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Encoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.SecretKey;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class JwtTokenProviderTest {

    private JwtTokenProvider tokenProvider;
    private SecretKey signingKey;
    private User user;
    private UserRepository userRepository;
    private TenantFilter filter;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        signingKey = Keys.hmacShaKeyFor(new byte[32]);
        tokenProvider = new JwtTokenProvider();
        ReflectionTestUtils.setField(tokenProvider, "jwtSecret", Encoders.BASE64.encode(signingKey.getEncoded()));
        ReflectionTestUtils.setField(tokenProvider, "jwtExpirationMs", 60_000L);
        user = completeUser();
        userRepository = mock(UserRepository.class);
        when(userRepository.findById(11L)).thenAnswer(invocation -> {
            assertContextsCleared();
            return Optional.of(user);
        });
        filter = new TenantFilter(tokenProvider, userRepository);
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void generatedTokensContainTheCompleteIdentityAndExactAuthenticationVersion() {
        for (Role.RoleType role : Role.RoleType.values()) {
            if (role == Role.RoleType.CUSTOMER) continue;
            user.getRole().setRoleType(role);
            for (Long version : List.of(0L, 12L, Long.MAX_VALUE)) {
                user.setAuthVersion(version);

                String token = tokenProvider.generateToken(user);
                assertTrue(tokenProvider.validateToken(token));
                Claims claims = tokenProvider.getClaimsFromToken(token);

                assertEquals(user.getEmail(), claims.getSubject());
                assertEquals(11L, claims.get("userId", Long.class));
                assertEquals(7L, claims.get("companyId", Long.class));
                assertEquals("Test Agent", claims.get("displayName", String.class));
                assertEquals("TEST", claims.get("companyCode", String.class));
                assertEquals(role.name(), claims.get("role", String.class));
                assertEquals(version, claims.get("authVersion", Long.class));
                assertNotNull(claims.getIssuedAt());
                assertNotNull(claims.getExpiration());
                assertEquals(60_000L, claims.getExpiration().getTime() - claims.getIssuedAt().getTime());
            }
        }
    }

    @Test
    void incompleteIdentitiesCannotReceiveTokensOrDefaultRoles() {
        assertThrows(IllegalArgumentException.class, () -> tokenProvider.generateToken(null));
        List<Consumer<User>> changes = List.of(
                candidate -> candidate.setId(null),
                candidate -> candidate.setId(0L),
                candidate -> candidate.setId(-1L),
                candidate -> candidate.setEmail(null),
                candidate -> candidate.setEmail(""),
                candidate -> candidate.setEmail(" "),
                candidate -> candidate.setEmail(" agent@example.invalid"),
                candidate -> candidate.setEmail("agent@example.invalid "),
                candidate -> candidate.setCompany(null),
                candidate -> candidate.getCompany().setId(null),
                candidate -> candidate.getCompany().setId(0L),
                candidate -> candidate.getCompany().setId(-1L),
                candidate -> candidate.setRole(null),
                candidate -> candidate.getRole().setRoleType(null),
                candidate -> candidate.getRole().setRoleType(Role.RoleType.CUSTOMER),
                candidate -> candidate.setAuthVersion(null),
                candidate -> candidate.setAuthVersion(-1L));
        for (Role.RoleType role : List.of(Role.RoleType.AGENT, Role.RoleType.SUPER_ADMIN)) {
            for (Consumer<User> change : changes) {
                User candidate = completeUser();
                candidate.getRole().setRoleType(role);
                change.accept(candidate);

                IllegalArgumentException failure = assertThrows(IllegalArgumentException.class,
                        () -> tokenProvider.generateToken(candidate));

                assertEquals("Cannot issue a token for an incomplete staff identity.", failure.getMessage());
            }
        }
    }

    @Test
    void malformedExpiredUnsignedAndWrongKeyTokensCannotAuthenticate() throws Exception {
        String expired = identityToken().claim("authVersion", 0L).expiration(new Date(1_000L))
                .signWith(signingKey).compact();
        String unsigned = identityToken().claim("authVersion", 0L).compact();
        String wrongKey = identityToken().claim("authVersion", 0L)
                .signWith(Jwts.SIG.HS256.key().build()).compact();

        for (String token : Arrays.asList(null, "", "not-a-jwt", expired, unsigned, wrongKey)) {
            assertFalse(tokenProvider.validateToken(token));
            if (token != null) assertRejected(token);
        }
        verifyNoInteractions(userRepository);
    }

    @Test
    void aNewlyIssuedTokenAuthenticatesOnlyItsVerifiedSignedTenant() throws Exception {
        assertAuthenticated(tokenProvider.generateToken(user));

        verify(userRepository).findById(11L);
    }

    @Test
    void aFreshLoginTokenWorksAfterThePreviousAuthenticationVersionIsRevoked() throws Exception {
        String previousToken = tokenProvider.generateToken(user);
        assertAuthenticated(previousToken);
        user.setAuthVersion(1L);

        assertRejected(previousToken);
        assertAuthenticated(tokenProvider.generateToken(user));

        verify(userRepository, times(3)).findById(11L);
    }

    @Test
    void legacySignedTokensWithoutAVersionRequireFreshLogin() throws Exception {
        String legacyToken = identityToken().signWith(signingKey).compact();

        assertRejected(legacyToken);
        verifyNoInteractions(userRepository);
        assertAuthenticated(tokenProvider.generateToken(user));
        verify(userRepository).findById(11L);
    }

    @Test
    void signedMalformedVersionsCannotBeCoercedIntoAValidVersion() throws Exception {
        for (Object version : List.of("0", 0.0d, 0.5d, -1L, true, Map.of("version", 0),
                BigInteger.valueOf(Long.MAX_VALUE).add(BigInteger.ONE))) {
            String token = identityToken().claim("authVersion", version).signWith(signingKey).compact();

            assertRejected(token);
        }
        verifyNoInteractions(userRepository);
    }

    private JwtBuilder identityToken() {
        Date now = new Date();
        return Jwts.builder()
                .subject(user.getEmail())
                .claim("userId", user.getId())
                .claim("companyId", user.getCompany().getId())
                .claim("role", user.getRole().getRoleType().name())
                .issuedAt(now)
                .expiration(new Date(now.getTime() + 60_000L));
    }

    private void assertRejected(String token) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request(token), response,
                (req, res) -> fail("Rejected authentication reached a handler"));

        assertEquals(401, response.getStatus());
        assertEquals("Invalid authentication.", response.getErrorMessage());
        assertContextsCleared();
    }

    private void assertAuthenticated(String token) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reachedHandler = new AtomicBoolean();

        filter.doFilter(request(token), response, (req, res) -> {
            reachedHandler.set(true);
            assertTrue(TenantContext.isAuthenticated());
            assertEquals(11L, TenantContext.getUserId());
            assertEquals(7L, TenantContext.getCompanyId());
            assertEquals("AGENT", TenantContext.getUserRole());
            assertEquals("agent@example.invalid", TenantContext.getUserEmail());
            assertFalse(TenantContext.hasAccessTo(8L));
            assertTrue(SecurityContextHolder.getContext().getAuthentication().isAuthenticated());
        });

        assertTrue(reachedHandler.get());
        assertEquals(200, response.getStatus());
        assertContextsCleared();
    }

    private void assertContextsCleared() {
        assertNull(TenantContext.getCompanyId());
        assertNull(TenantContext.getUserId());
        assertNull(TenantContext.getUserRole());
        assertNull(TenantContext.getUserEmail());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    private MockHttpServletRequest request(String token) {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/tickets");
        request.setServletPath("/api/v1/tickets");
        request.addHeader("Authorization", "Bearer " + token);
        request.addHeader("X-Company-ID", "8");
        return request;
    }

    private User completeUser() {
        Company company = new Company();
        company.setId(7L);
        company.setCompanyCode("TEST");
        Role role = new Role();
        role.setRoleType(Role.RoleType.AGENT);
        User candidate = new User();
        candidate.setId(11L);
        candidate.setEmail("agent@example.invalid");
        candidate.setDisplayName("Test Agent");
        candidate.setCompany(company);
        candidate.setRole(role);
        candidate.setAuthVersion(0L);
        return candidate;
    }
}
