package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.ServletException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TenantSecurityBoundaryTest {

    private JwtTokenProvider tokenProvider;
    private TenantFilter filter;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        SecurityContextHolder.clearContext();
        tokenProvider = mock(JwtTokenProvider.class);
        filter = new TenantFilter(tokenProvider);
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

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertNull(TenantContext.getCompanyId());
            assertNull(TenantContext.getUserId());
            assertNull(SecurityContextHolder.getContext().getAuthentication());
        });
    }

    @Test
    void invalidTokenCannotFallBackToTheTenantHeader() throws Exception {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("Authorization", "Bearer invalid-test-token");
        request.addHeader("X-Company-ID", "7");
        when(tokenProvider.validateToken("invalid-test-token")).thenReturn(false);

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertNull(TenantContext.getCompanyId());
            assertNull(SecurityContextHolder.getContext().getAuthentication());
        });
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
        Claims claims = Jwts.claims()
                .subject("agent@example.invalid")
                .add("userId", 11L)
                .add("companyId", 7L)
                .add("role", "AGENT")
                .build();
        when(tokenProvider.validateToken("valid-test-token")).thenReturn(true);
        when(tokenProvider.getClaimsFromToken("valid-test-token")).thenReturn(claims);
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("Authorization", "Bearer valid-test-token");
        request.addHeader("X-Company-ID", "8");

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertEquals(7L, TenantContext.getCompanyId());
            assertEquals(11L, TenantContext.getUserId());
            assertFalse(TenantContext.hasAccessTo(8L));
            assertTrue(SecurityContextHolder.getContext().getAuthentication().isAuthenticated());
        });
    }

    @Test
    void requestContextIsClearedWhenAHandlerFails() {
        MockHttpServletRequest request = ticketRequest();
        request.addHeader("X-Company-ID", "7");

        assertThrows(ServletException.class, () -> filter.doFilter(request, new MockHttpServletResponse(),
                (req, res) -> { throw new ServletException("Synthetic handler failure"); }));

        assertNull(TenantContext.getCompanyId());
        assertNull(TenantContext.getUserId());
        assertNull(TenantContext.getUserRole());
        assertNull(TenantContext.getUserEmail());
        assertNull(SecurityContextHolder.getContext().getAuthentication());
    }

    private MockHttpServletRequest ticketRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/tickets");
        request.setServletPath("/api/v1/tickets");
        return request;
    }
}
