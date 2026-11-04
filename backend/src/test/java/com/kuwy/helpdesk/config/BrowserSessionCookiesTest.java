package com.kuwy.helpdesk.config;

import com.kuwy.helpdesk.services.BrowserSessionService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.*;

class BrowserSessionCookiesTest {
    private final BrowserSessionCookies cookies = new BrowserSessionCookies(true, "https://app.example.invalid");

    @Test
    void credentialsAreHttpOnlySecureAndIsolatedByKindAndPath() {
        var tokens = new BrowserSessionService.Tokens("synthetic-session", "synthetic-access", "synthetic-refresh", "synthetic-csrf", 900, 3600);
        var staff = cookies.issue(tokens, "STAFF").get(HttpHeaders.SET_COOKIE);
        var customer = cookies.issue(tokens, "CUSTOMER").get(HttpHeaders.SET_COOKIE);
        assertNotNull(staff); assertNotNull(customer);
        assertEquals(2, staff.size());
        assertTrue(staff.getFirst().startsWith("kuwy_staff_access="));
        assertTrue(customer.getFirst().startsWith("kuwy_customer_access="));
        for (String cookie : staff) {
            assertTrue(cookie.contains("HttpOnly")); assertTrue(cookie.contains("Secure")); assertTrue(cookie.contains("SameSite=Strict"));
            assertFalse(cookie.contains("Domain=")); assertFalse(cookie.contains("synthetic-csrf"));
        }
        assertTrue(staff.get(1).contains("Path=/api/v1/auth"));
        assertTrue(customer.get(1).contains("Path=/api/v1/portal"));
        assertTrue(cookies.clear("STAFF").get(HttpHeaders.SET_COOKIE).stream().allMatch(value -> value.contains("Max-Age=0")));
    }

    @Test
    void browserMutationsRequireAnExplicitTrustedOriginAndCustomHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/auth/login");
        request.setContentType("application/json");
        request.addHeader("X-Browser-Session", "1");
        request.addHeader("Origin", "https://evil.example.invalid");
        assertThrows(SecurityException.class, () -> cookies.requireBrowserMutation(request));
        request.removeHeader("Origin"); request.addHeader("Origin", "https://app.example.invalid");
        assertDoesNotThrow(() -> cookies.requireBrowserMutation(request));
        request.removeHeader("X-Browser-Session");
        assertThrows(SecurityException.class, () -> cookies.requireBrowserMutation(request));
    }

    @Test
    void insecureCookiesAreRestrictedToLoopbackDevelopmentOrigins() {
        assertDoesNotThrow(() -> new BrowserSessionCookies(false, "http://localhost:5174"));
        assertThrows(IllegalStateException.class, () -> new BrowserSessionCookies(false, "https://app.example.invalid"));
        assertThrows(IllegalStateException.class, () -> new BrowserSessionCookies(true, "*"));
    }
}
