package com.kuwy.helpdesk.tenant;

import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.services.BrowserSessionService;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CookieTenantFilterTest {
    private final BrowserSessionService sessions = mock(BrowserSessionService.class);
    private final BrowserSessionCookies cookies = new BrowserSessionCookies(true, "http://localhost:5174");
    private final UserRepository users = mock(UserRepository.class);
    private final TenantFilter filter = new TenantFilter(mock(JwtTokenProvider.class), users, sessions, cookies);
    private com.kuwy.helpdesk.models.User user;

    @BeforeEach void staffAccount() {
        user = new com.kuwy.helpdesk.models.User();
        user.setId(11L);
        var role = new com.kuwy.helpdesk.models.Role(); role.setRoleType(com.kuwy.helpdesk.models.Role.RoleType.AGENT); user.setRole(role);
        var company = new com.kuwy.helpdesk.models.Company(); company.setId(7L); user.setCompany(company);
        when(users.findById(11L)).thenReturn(java.util.Optional.of(user));
    }

    @AfterEach void clear() { TenantContext.clear(); SecurityContextHolder.clearContext(); }

    @Test
    void staffCookieBindsCurrentIdentityAndClearsItAfterRequest() throws Exception {
        var request = request("GET", "/api/v1/tickets", "kuwy_staff_access");
        request.addHeader("X-Company-ID", "8");
        when(sessions.authenticate("synthetic-token", "STAFF", null, false)).thenReturn(identity("STAFF", "AGENT", 11L));
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertEquals(11L, TenantContext.requireUserId()); assertEquals(7L, TenantContext.getCompanyId());
            assertEquals("synthetic-session", TenantContext.getBrowserSessionId());
        });
        assertNull(TenantContext.getUserId()); assertNull(TenantContext.getBrowserSessionId());
    }

    @Test
    void customerAndStaffCookiesCannotSubstituteForEachOther() throws Exception {
        var request = request("GET", "/api/v1/portal/acme/tickets", "kuwy_customer_access");
        when(sessions.authenticate("synthetic-token", "CUSTOMER", null, false)).thenReturn(identity("CUSTOMER", "CUSTOMER", 31L));
        filter.doFilter(request, new MockHttpServletResponse(), (req, res) -> {
            assertEquals(31L, TenantContext.requireCustomerId(7L));
            assertFalse(TenantContext.isAuthenticated());
            assertThrows(SecurityException.class, TenantContext::requireUserId);
        });
        clearInvocations(sessions);
        filter.doFilter(request("GET", "/api/v1/tickets", "kuwy_customer_access"), new MockHttpServletResponse(), (req, res) -> assertNull(TenantContext.getUserId()));
        verifyNoInteractions(sessions);
    }

    @Test
    void unsafeCookieRequestsCannotReachHandlersWithoutValidCsrf() throws Exception {
        var request = request("POST", "/api/v1/tickets", "kuwy_staff_access");
        when(sessions.authenticate("synthetic-token", "STAFF", null, true)).thenThrow(new SecurityException("Invalid proof"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        AtomicBoolean called = new AtomicBoolean();
        filter.doFilter(request, response, (req, res) -> called.set(true));
        assertFalse(called.get()); assertEquals(403, response.getStatus()); assertNull(TenantContext.getUserId());
    }

    @Test
    void expiredAccessIsRejectedWhileRefreshBootstrapRemainsReachable() throws Exception {
        when(sessions.authenticate(anyString(), eq("STAFF"), isNull(), eq(false))).thenThrow(new BadCredentialsException("Expired"));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request("GET", "/api/v1/tickets", "kuwy_staff_access"), response, (req, res) -> fail("Expired access reached handler"));
        assertEquals(401, response.getStatus());
        clearInvocations(sessions);
        filter.doFilter(request("GET", "/api/v1/auth/session", "kuwy_staff_access"), new MockHttpServletResponse(), (req, res) -> assertNull(TenantContext.getUserId()));
        verifyNoInteractions(sessions);
    }

    @Test
    void requiredAuthenticatorBlocksWorkButAllowsEnrollment() throws Exception {
        user.getRole().setRoleType(com.kuwy.helpdesk.models.Role.RoleType.COMPANY_ADMIN);
        when(sessions.authenticate("synthetic-token", "STAFF", null, false)).thenReturn(identity("STAFF", "COMPANY_ADMIN", 11L));
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request("GET", "/api/v1/tickets", "kuwy_staff_access"), response, (req, res) -> fail("Unenrolled administrator reached tickets"));
        assertEquals(403, response.getStatus());
        filter.doFilter(request("GET", "/api/v1/auth/account", "kuwy_staff_access"), new MockHttpServletResponse(), (req, res) -> assertEquals(11L, TenantContext.requireUserId()));
        user.setIsTwoFactorEnabled(true);
        filter.doFilter(request("GET", "/api/v1/tickets", "kuwy_staff_access"), new MockHttpServletResponse(), (req, res) -> assertEquals(11L, TenantContext.requireUserId()));
    }

    private BrowserSessionService.Identity identity(String kind, String role, Long id) {
        return new BrowserSessionService.Identity("synthetic-session", kind, id, 7L, "person@example.invalid", role, 0L);
    }

    private MockHttpServletRequest request(String method, String path, String cookieName) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setCookies(new Cookie(cookieName, "synthetic-token"));
        return request;
    }
}
