package com.kuwy.helpdesk.controllers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.models.CustomerAccount;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.services.SecurityAuditService;
import com.kuwy.helpdesk.tenant.TenantContext;
import com.kuwy.helpdesk.tenant.TenantFilter;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PortalProfileControllerTest {
    private static final String EMAIL = "person@example.invalid";
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final EntityManager em = mock(EntityManager.class);
    private final SecurityAuditService audit = mock(SecurityAuditService.class);
    private final PortalProfileController controller = new PortalProfileController(companies, em, audit);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final ObjectMapper json = new ObjectMapper();
    private Company company;
    private Contact contact;

    @BeforeEach void setUp() {
        company = new Company(); company.setId(7L); company.setSubdomain("acme");
        contact = new Contact(); contact.setId(11L); contact.setCompany(company);
        contact.setFirstName("Ada"); contact.setEmail(EMAIL); contact.setIsPortalUser(true); contact.setAuthVersion(4L);
        CustomerAccount account = new CustomerAccount(); account.setId(31L); account.setCompany(company); contact.setAccount(account);
        when(companies.findBySubdomain("acme")).thenReturn(Optional.of(company));
        when(em.find(Contact.class, 11L)).thenReturn(contact);
        TenantContext.setContext(7L, 11L, "CUSTOMER", EMAIL);
        TenantContext.setBrowserSessionId("synthetic-session");
        request.setRemoteAddr("192.0.2.10"); request.addHeader("User-Agent", "Profile test");
    }

    @AfterEach void clear() { TenantContext.clear(); }

    @ParameterizedTest
    @ValueSource(strings = {"anonymous", "staff", "tenant", "zero", "no-cookie", "blocked", "null-blocked", "portal", "email", "contact-tenant", "id", "missing"})
    void getAndPatchRequireTheCurrentCookieCustomer(String invalid) {
        switch (invalid) {
            case "anonymous" -> TenantContext.clear();
            case "staff" -> TenantContext.setContext(7L, 11L, "SUPER_ADMIN", EMAIL);
            case "tenant" -> TenantContext.setContext(8L, 11L, "CUSTOMER", EMAIL);
            case "zero" -> TenantContext.setContext(7L, 0L, "CUSTOMER", EMAIL);
            case "no-cookie" -> TenantContext.setBrowserSessionId(null);
            case "blocked" -> contact.setIsBlocked(true);
            case "null-blocked" -> contact.setIsBlocked(null);
            case "portal" -> contact.setIsPortalUser(false);
            case "email" -> contact.setEmail("changed@example.invalid");
            case "contact-tenant" -> { Company foreign = new Company(); foreign.setId(8L); contact.setCompany(foreign); }
            case "id" -> contact.setId(12L);
            case "missing" -> when(em.find(Contact.class, 11L)).thenReturn(null);
        }
        denied(401, () -> controller.get("acme"));
        denied(401, () -> controller.patch("acme", Map.of("firstName", "Changed"), request));
        assertEquals("Ada", contact.getFirstName()); verify(em, never()).flush(); verifyNoInteractions(audit);
    }

    @Test void getIsReadOnlyAndReturnsOnlyTheSafeProfileWithDefaults() {
        contact.setLastName("<b>Lovelace</b><script>bad()</script>");
        var response = controller.get("ACME");
        var profile = response.getBody();
        assertNotNull(profile); assertEquals("no-store", response.getHeaders().getCacheControl());
        assertEquals("Lovelace", profile.lastName()); assertEquals("", profile.phone()); assertEquals("", profile.organizationName());
        assertEquals("UTC", profile.timeZone()); assertEquals("en", profile.language());
        assertEquals(new PortalProfileController.Notifications(true, true, true), profile.notifications());
        assertEquals(Set.of("firstName", "lastName", "email", "phone", "organizationName", "timeZone", "language", "notifications"),
                json.convertValue(profile, Map.class).keySet());
        verify(em, never()).refresh(any(), any(LockModeType.class), anyMap()); verify(em, never()).flush(); verifyNoInteractions(audit);
        assertTrue(contact.getLastName().contains("<script>"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"email", "id", "company", "companyId", "account", "accountId", "role", "owner", "isPortalUser", "authVersion", "isBlocked", "unknown"})
    void unknownAndIdentityFieldsCannotBePatched(String field) {
        denied(400, () -> controller.patch("acme", Map.of("firstName", "Changed", field, "forged"), request));
        assertEquals("Ada", contact.getFirstName()); assertEquals(4L, contact.getAuthVersion());
        verify(em, never()).flush(); verifyNoInteractions(audit);
    }

    @Test void allValidationCompletesBeforeAnyMutation() {
        for (Map<String, Object> invalid : java.util.List.<Map<String, Object>>of(
                Map.of("firstName", " "), Map.of("firstName", "x".repeat(101)), Map.of("lastName", "x".repeat(101)),
                Map.of("phone", "x".repeat(31)), Map.of("organizationName", "x".repeat(151)),
                Map.of("lastName", "bad\nname"), Map.of("phone", "bad\u0000phone"), Map.of("phone", 123),
                Map.of("timeZone", "Mars/Olympus"), Map.of("timeZone", "x".repeat(65)),
                Map.of("language", "fr"), Map.of("notifications", Map.of("replies", "false")),
                Map.of("notifications", Map.of("email", false)), Map.of("notifications", true))) {
            Map<String, Object> patch = new LinkedHashMap<>(); patch.put("firstName", "Changed"); patch.putAll(invalid);
            denied(400, () -> controller.patch("acme", patch, request));
            assertEquals("Ada", contact.getFirstName()); assertEquals("UTC", contact.getTimeZone());
        }
        Map<String, Object> nullField = new LinkedHashMap<>(); nullField.put("phone", null);
        denied(400, () -> controller.patch("acme", nullField, request));
        verify(em, never()).flush(); verifyNoInteractions(audit);
    }

    @Test void patchLocksSanitizesPersistsAndAuditsWithoutChangingIdentityOrMembership() {
        CustomerAccount account = contact.getAccount();
        var updated = controller.patch("acme", Map.of("firstName", " <b>Grace</b> ", "lastName", "Hopper",
                "phone", " +1 555 0100 ", "organizationName", "<b>New label</b>", "timeZone", "Asia/Kolkata",
                "language", "en", "notifications", Map.of("replies", false, "surveys", false)), request).getBody();
        assertNotNull(updated); assertEquals("Grace", updated.firstName()); assertEquals("+1 555 0100", updated.phone());
        assertEquals("New label", updated.organizationName()); assertEquals("Asia/Kolkata", updated.timeZone());
        assertEquals(new PortalProfileController.Notifications(false, true, false), updated.notifications());
        assertEquals(EMAIL, contact.getEmail()); assertEquals(4L, contact.getAuthVersion()); assertFalse(contact.getIsBlocked());
        assertTrue(contact.getIsPortalUser()); assertSame(company, contact.getCompany()); assertSame(account, contact.getAccount());
        var order = inOrder(em, audit);
        order.verify(em).find(Contact.class, 11L);
        order.verify(em).refresh(contact, LockModeType.PESSIMISTIC_WRITE, Map.of("jakarta.persistence.lock.timeout", 2000));
        order.verify(em).flush();
        order.verify(audit).recordEvent(7L, null, "CUSTOMER_PROFILE_UPDATED", null, "contact:11", request);
        assertEquals(updated, controller.get("acme").getBody());
    }

    @Test void rechecksContactAfterTheWriteLockAndPreservesOmittedFields() {
        controller.patch("acme", Map.of("notifications", Map.of("surveys", false)), request);
        assertEquals("Ada", contact.getFirstName()); assertFalse(contact.getNotifySurveys()); assertTrue(contact.getNotifyReplies());
        clearInvocations(em, audit);
        doAnswer(call -> { contact.setIsBlocked(true); return null; }).when(em).refresh(eq(contact), eq(LockModeType.PESSIMISTIC_WRITE), anyMap());
        denied(401, () -> controller.patch("acme", Map.of("firstName", "Changed"), request));
        assertEquals("Ada", contact.getFirstName()); verify(em, never()).flush(); verifyNoInteractions(audit);
    }

    @Test void httpRoutesRequireTheCustomerCookieAndMutationCsrfNotCallerHeaders() throws Exception {
        TenantContext.clear();
        BrowserSessionService sessions = mock(BrowserSessionService.class);
        var filter = new TenantFilter(mock(JwtTokenProvider.class), mock(UserRepository.class), sessions,
                new BrowserSessionCookies(true, "http://localhost:5174"));
        var identity = new BrowserSessionService.Identity("synthetic-session", "CUSTOMER", 11L, 7L, EMAIL, "CUSTOMER", 4L);
        when(sessions.authenticate("synthetic-access", "CUSTOMER", null, false)).thenReturn(identity);
        when(sessions.authenticate("synthetic-access", "CUSTOMER", null, true)).thenThrow(new SecurityException());
        when(sessions.authenticate("synthetic-access", "CUSTOMER", "synthetic-csrf", true)).thenReturn(identity);
        var mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new GlobalExceptionHandler()).addFilters(filter).build();
        String path = "/api/v1/portal/acme/profile";
        mvc.perform(get(path).header("X-Company-ID", "7").param("email", EMAIL)).andExpect(status().isUnauthorized());
        Cookie cookie = new Cookie("kuwy_customer_access", "synthetic-access");
        mvc.perform(get(path).cookie(cookie).param("email", "other@example.invalid")).andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(EMAIL)).andExpect(jsonPath("$.id").doesNotExist())
                .andExpect(header().string("Cache-Control", "no-store"));
        mvc.perform(patch(path).cookie(cookie).contentType("application/json").content("{\"firstName\":\"Grace\"}"))
                .andExpect(status().isForbidden()); assertEquals("Ada", contact.getFirstName());
        mvc.perform(patch(path).cookie(cookie).header("X-Session-CSRF", "synthetic-csrf").contentType("application/json")
                .content("{\"firstName\":\"Grace\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.firstName").value("Grace"));
        mvc.perform(patch(path).cookie(cookie).header("X-Session-CSRF", "synthetic-csrf").contentType("application/json")
                .content("{\"email\":\"other@example.invalid\"}")).andExpect(status().isBadRequest());
        assertNull(TenantContext.getUserId());
    }

    @Test void transactionContractKeepsGetsReadOnlyAndPatchesAtomic() throws Exception {
        var attributes = new AnnotationTransactionAttributeSource();
        var read = attributes.getTransactionAttribute(PortalProfileController.class.getMethod("get", String.class), PortalProfileController.class);
        var write = attributes.getTransactionAttribute(PortalProfileController.class.getMethod("patch", String.class, Map.class,
                jakarta.servlet.http.HttpServletRequest.class), PortalProfileController.class);
        assertNotNull(read); assertTrue(read.isReadOnly()); assertNotNull(write); assertFalse(write.isReadOnly());
        assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, write.getIsolationLevel());
        assertTrue(write.rollbackOn(new IllegalStateException("persistence failure")));
    }

    private void denied(int status, Runnable operation) {
        assertEquals(status, assertThrows(ResponseStatusException.class, operation::run).getStatusCode().value());
    }
}
