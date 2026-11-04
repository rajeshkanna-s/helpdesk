package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.MalformedJwtException;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.Arrays;
import java.util.HashMap;
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

class TenantSecurityBoundaryTest {

    private JwtTokenProvider tokenProvider;
    private UserRepository userRepository;
    private User currentUser;
    private TenantFilter filter;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        tokenProvider = mock(JwtTokenProvider.class);
        userRepository = mock(UserRepository.class);
        currentUser = activeUser();
        when(userRepository.findById(11L)).thenAnswer(invocation -> {
            assertContextsCleared();
            return Optional.ofNullable(currentUser);
        });
        filter = new TenantFilter(tokenProvider, userRepository, mock(com.kuwy.helpdesk.services.BrowserSessionService.class), mock(com.kuwy.helpdesk.config.BrowserSessionCookies.class));
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
    }

    @Test
    void unsignedTenantHeaderDoesNotCreateAnIdentity() throws Exception {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("X-Company-ID", "7");
        TenantContext.setContext(9L, 99L, "SUPER_ADMIN", "stale@example.invalid");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("stale", null, List.of()));

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> assertContextsCleared());

        assertContextsCleared();
        verifyNoInteractions(tokenProvider, userRepository);
    }

    @Test
    void invalidTokenCannotFallBackToTheTenantHeader() throws Exception {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("Authorization", "Bearer invalid-test-token");
        request.addHeader("X-Company-ID", "7");
        when(tokenProvider.validateToken("invalid-test-token")).thenReturn(false);

        assertRejected(request, 401, "Invalid authentication.");
        verifyNoInteractions(userRepository);
    }

    @Test
    void aTenantIdAloneCannotAuthorizeItsResources() {
        TenantContext.setCompanyId(7L);

        assertFalse(TenantContext.hasAccessTo(7L));
        assertThrows(SecurityException.class, () -> TenantContext.assertAccessTo(7L));
    }

    @Test
    void missingUserIdentityCannotClaimPlatformPrivileges() {
        TenantContext.setContext(null, null, "SUPER_ADMIN", null);

        assertFalse(TenantContext.isSuperAdmin());
        assertFalse(TenantContext.hasAccessTo(7L));
    }

    @Test
    void unknownRoleCannotAuthorizeTenantResources() {
        TenantContext.setContext(7L, 11L, "UNRECOGNIZED_ROLE", "person@example.invalid");

        assertFalse(TenantContext.hasAccessTo(7L));
    }

    @Test
    void authenticatedStaffCanOnlyAccessTheirOwnTenant() {
        TenantContext.setContext(7L, 11L, "AGENT", "agent@example.invalid");

        assertTrue(TenantContext.hasAccessTo(7L));
        assertFalse(TenantContext.hasAccessTo(8L));
        assertThrows(SecurityException.class, () -> TenantContext.assertAccessTo(8L));
    }

    @Test
    void unsignedOverrideDoesNotReplaceTheSignedStaffTenant() throws Exception {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));

        assertAuthenticated(bearerRequest(), 7L, Role.RoleType.AGENT);
        verify(userRepository).findById(11L);
    }

    @Test
    void missingRequiredClaimsAreRejectedBeforeLookingUpAUser() throws Exception {
        for (String name : List.of(Claims.SUBJECT, "userId", "companyId", "role", "authVersion")) {
            Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, 0L));
            values.remove(name);
            stubClaimValues(values);

            assertRejected(bearerRequest(), 401, "Invalid authentication.");
        }
        verifyNoInteractions(userRepository);
    }

    @Test
    void numericClaimsCannotBeCoercedTruncatedOrOverflowedIntoAnIdentity() throws Exception {
        List<Object> invalidNumbers = Arrays.asList(null, "11", true, 11.0d, 11.5d, Float.NaN,
                new BigDecimal("11.0"), BigInteger.valueOf(Long.MAX_VALUE).add(BigInteger.ONE),
                List.of(11), Map.of("id", 11), -1L, Long.MIN_VALUE);
        for (String name : List.of("userId", "companyId", "authVersion")) {
            for (Object invalid : invalidNumbers) {
                Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, 0L));
                values.put(name, invalid);
                stubClaimValues(values);

                assertRejected(bearerRequest(), 401, "Invalid authentication.");
            }
        }
        for (String name : List.of("userId", "companyId")) {
            Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, 0L));
            values.put(name, 0L);
            stubClaimValues(values);

            assertRejected(bearerRequest(), 401, "Invalid authentication.");
        }
        verifyNoInteractions(userRepository);
    }

    @Test
    void malformedSubjectsAndRolesCannotCreateAFallbackIdentity() throws Exception {
        for (Object invalid : List.of("", " ", " agent@example.invalid", "agent@example.invalid ",
                11, true, List.of("agent@example.invalid"))) {
            Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, 0L));
            values.put(Claims.SUBJECT, invalid);
            stubClaimValues(values);

            assertRejected(bearerRequest(), 401, "Invalid authentication.");
        }
        for (Object invalid : List.of("", " ", "UNKNOWN_ROLE", "agent", " AGENT", "CUSTOMER",
                11, true, List.of("SUPER_ADMIN"))) {
            Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, 0L));
            values.put("role", invalid);
            stubClaimValues(values);

            assertRejected(bearerRequest(), 401, "Invalid authentication.");
        }
        verifyNoInteractions(userRepository);
    }

    @Test
    void parserFailuresReturnASanitizedUnauthorizedResponse() throws Exception {
        when(tokenProvider.validateToken("valid-test-token")).thenReturn(true);
        when(tokenProvider.getClaimsFromToken("valid-test-token"))
                .thenThrow(new MalformedJwtException("Synthetic private parser detail"));

        assertRejected(bearerRequest(), 401, "Invalid authentication.");
        verifyNoInteractions(userRepository);
    }

    @Test
    void anEmptyBearerTokenIsRejectedWithoutConsultingTheDatabase() throws Exception {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("Authorization", "Bearer   ");
        request.addHeader("X-Company-ID", "7");

        assertRejected(request, 401, "Invalid authentication.");
        verifyNoInteractions(userRepository);
    }

    @Test
    void aDeletedUserCannotAuthenticateWithAnOtherwiseValidToken() throws Exception {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));
        currentUser = null;

        assertRejected(bearerRequest(), 401, "Invalid authentication.");
        verify(userRepository).findById(11L);
    }

    @Test
    void inactiveOrDisabledUsersIncludingPlatformAdministratorsAreRejected() throws Exception {
        List<Consumer<User>> changes = List.of(
                user -> user.setIsActive(false),
                user -> user.setIsActive(null),
                user -> user.setStatus("DISABLED"),
                user -> user.setStatus("INACTIVE"),
                user -> user.setStatus("PENDING"),
                user -> user.setStatus(null));
        for (Role.RoleType role : List.of(Role.RoleType.AGENT, Role.RoleType.SUPER_ADMIN)) {
            stubToken(claimsFor(role, 0L));
            for (Consumer<User> change : changes) {
                currentUser = activeUser();
                currentUser.getRole().setRoleType(role);
                change.accept(currentUser);

                assertRejected(bearerRequest(), 401, "Invalid authentication.");
            }
        }
    }

    @Test
    void changedOrIncompleteCurrentIdentitiesAndVersionsAreRejected() throws Exception {
        List<Consumer<User>> changes = List.of(
                user -> user.setId(12L),
                user -> user.setId(null),
                user -> user.setEmail("changed@example.invalid"),
                user -> user.setEmail("AGENT@example.invalid"),
                user -> user.setEmail(null),
                user -> user.getRole().setRoleType(Role.RoleType.COMPANY_ADMIN),
                user -> user.getRole().setRoleType(null),
                user -> user.setRole(null),
                user -> user.getCompany().setId(8L),
                user -> user.getCompany().setId(null),
                user -> user.getCompany().setStatus(null),
                user -> user.setCompany(null),
                user -> user.setAuthVersion(1L),
                user -> user.setAuthVersion(-1L),
                user -> user.setAuthVersion(null));
        for (Role.RoleType role : List.of(Role.RoleType.AGENT, Role.RoleType.SUPER_ADMIN)) {
            stubToken(claimsFor(role, 0L));
            for (Consumer<User> change : changes) {
                currentUser = activeUser();
                currentUser.getRole().setRoleType(role);
                change.accept(currentUser);

                assertRejected(bearerRequest(), 401, "Invalid authentication.");
            }
        }
    }

    @Test
    void aSignedPlatformRoleCannotOverrideTheCurrentDatabaseRole() throws Exception {
        stubToken(claimsFor(Role.RoleType.SUPER_ADMIN, 0L));

        assertRejected(bearerRequest(), 401, "Invalid authentication.");
    }

    @Test
    void suspendedAndInactiveCompaniesCannotAuthenticateStaff() throws Exception {
        for (Role.RoleType role : List.of(Role.RoleType.COMPANY_ADMIN, Role.RoleType.TEAM_LEAD,
                Role.RoleType.AGENT, Role.RoleType.LIGHT_AGENT)) {
            stubToken(claimsFor(role, 0L));
            for (Company.CompanyStatus status : List.of(Company.CompanyStatus.SUSPENDED,
                    Company.CompanyStatus.INACTIVE)) {
                currentUser = activeUser();
                currentUser.getRole().setRoleType(role);
                currentUser.getCompany().setStatus(status);

                assertRejected(bearerRequest(), 401, "Invalid authentication.");
            }
        }
    }

    @Test
    void currentStaffCanAuthenticateInActiveAndTrialCompanies() throws Exception {
        for (Role.RoleType role : List.of(Role.RoleType.COMPANY_ADMIN, Role.RoleType.TEAM_LEAD,
                Role.RoleType.AGENT, Role.RoleType.LIGHT_AGENT)) {
            for (Company.CompanyStatus status : List.of(Company.CompanyStatus.ACTIVE,
                    Company.CompanyStatus.TRIAL)) {
                currentUser = activeUser();
                currentUser.getRole().setRoleType(role);
                currentUser.getCompany().setStatus(status);
                currentUser.setAuthVersion(12L);
                stubToken(claimsFor(role, 12L));

                assertAuthenticated(bearerRequest(), 7L, role);
            }
        }
    }

    @Test
    void verifiedPlatformAdministratorsCanOverrideTenantsDespiteCompanySuspension() throws Exception {
        for (Company.CompanyStatus status : Company.CompanyStatus.values()) {
            currentUser = activeUser();
            currentUser.getRole().setRoleType(Role.RoleType.SUPER_ADMIN);
            currentUser.getCompany().setStatus(status);
            stubToken(claimsFor(Role.RoleType.SUPER_ADMIN, 0L));

            assertAuthenticated(bearerRequest(), 8L, Role.RoleType.SUPER_ADMIN);
        }
    }

    @Test
    void invalidPlatformOverridesLeaveTheVerifiedSignedTenantInPlace() throws Exception {
        currentUser.getRole().setRoleType(Role.RoleType.SUPER_ADMIN);
        stubToken(claimsFor(Role.RoleType.SUPER_ADMIN, 0L));
        for (String override : List.of("", " ", "invalid", "0", "-1", "9223372036854775808")) {
            MockHttpServletRequest request = ticketRequest();
            request.addHeader("Authorization", "Bearer valid-test-token");
            request.addHeader("X-Company-ID", override);

            assertAuthenticated(request, 7L, Role.RoleType.SUPER_ADMIN);
        }
    }

    @Test
    void integerJsonClaimsAndTheMaximumAuthVersionAreAcceptedWithoutTruncation() throws Exception {
        currentUser.setAuthVersion(Long.MAX_VALUE);
        Map<String, Object> values = new HashMap<>(claimsFor(Role.RoleType.AGENT, Long.MAX_VALUE));
        values.put("userId", 11);
        values.put("companyId", 7);
        stubClaimValues(values);

        assertAuthenticated(bearerRequest(), 7L, Role.RoleType.AGENT);
    }

    @Test
    void everyRequestReloadsCurrentStateAndRejectsARevokedVersion() throws Exception {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));
        assertAuthenticated(bearerRequest(), 7L, Role.RoleType.AGENT);
        currentUser.setAuthVersion(1L);

        assertRejected(bearerRequest(), 401, "Invalid authentication.");
        verify(userRepository, times(2)).findById(11L);
    }

    @Test
    void authenticationDatabaseFailuresFailClosedWithASanitizedServiceUnavailableResponse() throws Exception {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));
        when(userRepository.findById(11L))
                .thenThrow(new DataAccessResourceFailureException("Synthetic private database detail"));

        assertRejected(bearerRequest(), 503, "Authentication service unavailable.");
    }

    @Test
    void authenticationStateReadFailuresAlsoFailClosedWithoutLeakingDetails() throws Exception {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));
        currentUser = mock(User.class);
        when(currentUser.getId()).thenThrow(new IllegalStateException("Synthetic private persistence detail"));

        assertRejected(bearerRequest(), 503, "Authentication service unavailable.");
    }

    @Test
    void requestContextIsClearedWhenAHandlerFails() {
        stubToken(claimsFor(Role.RoleType.AGENT, 0L));

        assertThrows(ServletException.class, () -> filter.doFilter(bearerRequest(), new MockHttpServletResponse(),
                (req, res) -> {
                    assertTrue(TenantContext.isAuthenticated());
                    assertTrue(SecurityContextHolder.getContext().getAuthentication().isAuthenticated());
                    throw new ServletException("Synthetic handler failure");
                }));

        assertContextsCleared();
    }

    private void assertContextsCleared() {
        assertNull(TenantContext.getCompanyId());
        assertNull(TenantContext.getUserId());
        assertNull(TenantContext.getUserRole());
        assertNull(TenantContext.getUserEmail());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    private void assertRejected(MockHttpServletRequest request, int status, String message) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, (req, res) -> fail("Rejected authentication reached a handler"));

        assertEquals(status, response.getStatus());
        assertEquals(message, response.getErrorMessage());
        assertContextsCleared();
    }

    private void assertAuthenticated(MockHttpServletRequest request, Long companyId, Role.RoleType role) throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean reachedHandler = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> {
            reachedHandler.set(true);
            assertEquals(companyId, TenantContext.getCompanyId());
            assertEquals(11L, TenantContext.getUserId());
            assertEquals("agent@example.invalid", TenantContext.getUserEmail());
            assertEquals(role.name(), TenantContext.getUserRole());
            assertTrue(TenantContext.isAuthenticated());
            assertEquals(role == Role.RoleType.SUPER_ADMIN, TenantContext.hasAccessTo(8L));
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            assertNotNull(authentication);
            assertTrue(authentication.isAuthenticated());
            assertEquals("agent@example.invalid", authentication.getName());
            assertNull(authentication.getCredentials());
            assertEquals(List.of("ROLE_" + role.name()), authentication.getAuthorities().stream()
                    .map(authority -> authority.getAuthority()).toList());
        });

        assertTrue(reachedHandler.get());
        assertEquals(200, response.getStatus());
        assertContextsCleared();
    }

    private void stubToken(Claims claims) {
        when(tokenProvider.validateToken("valid-test-token")).thenReturn(true);
        when(tokenProvider.getClaimsFromToken("valid-test-token")).thenReturn(claims);
    }

    private void stubClaimValues(Map<String, Object> values) {
        Claims claims = mock(Claims.class);
        for (String name : List.of(Claims.SUBJECT, "userId", "companyId", "role", "authVersion")) {
            when(claims.get(name)).thenReturn(values.get(name));
        }
        stubToken(claims);
    }

    private Claims claimsFor(Role.RoleType role, Long authVersion) {
        return Jwts.claims()
                .subject("agent@example.invalid")
                .add("userId", 11L)
                .add("companyId", 7L)
                .add("role", role.name())
                .add("authVersion", authVersion)
                .build();
    }

    private MockHttpServletRequest bearerRequest() {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("Authorization", "Bearer valid-test-token");
        request.addHeader("X-Company-ID", "8");
        return request;
    }

    private MockHttpServletRequest ticketRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/tickets");
        request.setServletPath("/api/v1/tickets");
        return request;
    }

    private User activeUser() {
        Company company = new Company();
        company.setId(7L);
        Role role = new Role();
        role.setRoleType(Role.RoleType.AGENT);
        User user = new User();
        user.setIsTwoFactorEnabled(true);
        user.setId(11L);
        user.setEmail("agent@example.invalid");
        user.setCompany(company);
        user.setRole(role);
        user.setAuthVersion(0L);
        return user;
    }
}
