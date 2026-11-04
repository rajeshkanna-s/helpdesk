package com.kuwy.helpdesk.controllers;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.services.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PublicPortalOtpSecurityTest {
    private static final String EMAIL = "person@example.invalid";
    private static final String CODE = "482619";
    private static final String IP = "198.51.100.23";
    private CompanyRepository companies;
    private RateLimiterService limits;
    private CustomerOtpService otps;
    private JwtTokenProvider tokens;
    private EmailService legacyEmails;
    private PublicPortalController controller;
    private Company company;
    private MockHttpServletRequest http;
    private Logger logger;
    private Level previousLevel;
    private ListAppender<ILoggingEvent> logs;

    @BeforeEach
    void setUp() {
        companies = mock(CompanyRepository.class);
        limits = mock(RateLimiterService.class);
        otps = mock(CustomerOtpService.class);
        tokens = mock(JwtTokenProvider.class);
        legacyEmails = mock(EmailService.class);
        controller = new PublicPortalController(companies, mock(DepartmentRepository.class), mock(TicketRepository.class),
                mock(TicketThreadRepository.class), mock(TicketService.class), limits, mock(SubscriptionService.class),
                mock(JdbcTemplate.class), otps, legacyEmails, tokens, mock(com.kuwy.helpdesk.services.PortalTicketService.class),
                mock(com.kuwy.helpdesk.services.PortalLoginService.class), mock(com.kuwy.helpdesk.config.BrowserSessionCookies.class));
        company = new Company();
        company.setId(7L);
        company.setSubdomain("acme");
        company.setName("Acme Support");
        when(companies.findBySubdomain("acme")).thenReturn(Optional.of(company));
        when(limits.allowOtpRequest(anyString(), anyString())).thenReturn(true);
        when(limits.allowAuthentication(anyString(), anyString(), anyString())).thenReturn(true);
        http = new MockHttpServletRequest();
        http.setRemoteAddr(IP);
        http.addHeader("X-Forwarded-For", "203.0.113.99, 203.0.113.100");
        http.addHeader("X-Company-ID", "999");
        logger = (Logger) LoggerFactory.getLogger(PublicPortalController.class);
        previousLevel = logger.getLevel();
        logger.setLevel(Level.ALL);
        logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void noOtpOrDeliveryExceptionLogging() {
        logger.detachAppender(logs);
        logger.setLevel(previousLevel);
        logs.stop();
        assertTrue(logs.list.isEmpty());
        verifyNoInteractions(legacyEmails);
    }

    @Test
    void requestUsesTheServerCompanyCanonicalEmailAndRemoteIpAndReportsOnlyQueued() {
        var response = controller.requestOtp("ACME", Map.of("email", " PERSON@EXAMPLE.INVALID ", "companyId", "999"), http);
        assertEquals(200, response.getStatusCode().value());
        assertEquals(Set.of("success", "message"), response.getBody().keySet());
        assertEquals(true, response.getBody().get("success"));
        assertEquals("A verification email has been queued. Check your inbox for a 6-digit code.",
                response.getBody().get("message"));
        var order = inOrder(companies, limits, otps);
        order.verify(companies).findBySubdomain("acme");
        order.verify(limits).allowOtpRequest(IP, "7:" + EMAIL);
        order.verify(otps).generateAndDispatchOtp(7L, EMAIL, "Acme Support");
        verifyNoInteractions(tokens);
    }

    @Test
    void rateLimitedRequestsNeverGenerateAReplacement() {
        when(limits.allowOtpRequest(IP, "7:" + EMAIL)).thenReturn(false);
        var response = controller.requestOtp("acme", Map.of("email", EMAIL), http);
        assertEquals(429, response.getStatusCode().value());
        assertEquals(Set.of("error"), response.getBody().keySet());
        verifyNoInteractions(otps, tokens);
    }

    @Test
    void queueFailureReturnsUnavailableWithoutFalseSuccessOrExceptionContents() {
        doThrow(new IllegalStateException("<strong>" + CODE + "</strong> " + EMAIL)).when(otps)
                .generateAndDispatchOtp(7L, EMAIL, "Acme Support");
        var response = controller.requestOtp("acme", Map.of("email", EMAIL), http);
        assertEquals(503, response.getStatusCode().value());
        assertEquals(Map.of("error", "Verification email could not be queued. Please try again later."), response.getBody());
        assertFalse(response.getBody().toString().contains(CODE));
        assertFalse(response.getBody().toString().contains(EMAIL));
        verifyNoInteractions(tokens);
    }

    @Test
    void rateLimitedVerificationCannotCheckAnOtpOrIssueCredentials() {
        when(limits.allowAuthentication(IP, "7:" + EMAIL, "customer-otp-verify")).thenReturn(false);
        var response = controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", CODE), http);
        assertEquals(429, response.getStatusCode().value());
        assertEquals(Set.of("error"), response.getBody().keySet());
        assertFalse(response.getBody().toString().contains(CODE));
        verifyNoInteractions(otps, tokens);
    }

    @Test
    void anIncorrectOrMissingOtpEntryCannotIssueCredentials() {
        var response = controller.verifyOtp("ACME", Map.of("email", " PERSON@EXAMPLE.INVALID ", "otp", CODE), http);
        assertEquals(400, response.getStatusCode().value());
        assertEquals(Map.of("error", "Invalid or expired verification code"), response.getBody());
        var order = inOrder(limits, otps);
        order.verify(limits).allowAuthentication(IP, "7:" + EMAIL, "customer-otp-verify");
        order.verify(otps).verifyOtp(7L, EMAIL, CODE);
        verifyNoInteractions(tokens);
    }

    @ParameterizedTest
    @EnumSource(value = Company.CompanyStatus.class, names = {"ACTIVE", "TRIAL"})
    void onlyVerifiedEmailInAnEligibleServerCompanyReachesTheTokenProvider(Company.CompanyStatus status) {
        company.setStatus(status);
        when(otps.verifyOtp(7L, EMAIL, CODE)).thenReturn(true);
        when(tokens.generateCustomerToken(EMAIL, 7L, "acme")).thenReturn("signed-by-existing-provider");
        assertEquals(200, controller.requestOtp("ACME", Map.of("email", EMAIL), http).getStatusCode().value());
        var response = controller.verifyOtp("ACME", Map.of("email", " PERSON@EXAMPLE.INVALID ", "otp", CODE,
                "companyId", "999", "subdomain", "attacker"), http);
        assertEquals(200, response.getStatusCode().value());
        assertEquals(Map.of("success", true, "token", "signed-by-existing-provider", "email", EMAIL, "companyId", 7L),
                response.getBody());
        var order = inOrder(limits, otps, tokens);
        order.verify(limits).allowAuthentication(IP, "7:" + EMAIL, "customer-otp-verify");
        order.verify(otps).verifyOtp(7L, EMAIL, CODE);
        order.verify(tokens).generateCustomerToken(EMAIL, 7L, "acme");
    }

    @ParameterizedTest
    @NullSource
    @EnumSource(value = Company.CompanyStatus.class, names = {"SUSPENDED", "INACTIVE"})
    void inactiveOrUnknownCompanyStatusCannotRequestOrVerify(Company.CompanyStatus status) {
        company.setStatus(status);
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> controller.requestOtp("acme", Map.of("email", EMAIL), http)).getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", CODE), http)).getStatusCode().value());
        verifyNoInteractions(limits, otps, tokens);
    }

    @Test
    void anUnknownCompanyCannotRequestOrVerifyEvenWithAnOverrideHeader() {
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.requestOtp("unknown", Map.of("email", EMAIL), http)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.verifyOtp("unknown", Map.of("email", EMAIL, "otp", CODE), http)).getStatusCode().value());
        verifyNoInteractions(limits, otps, tokens);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(longs = {0, -1})
    void anInvalidServerCompanyIdCannotBeUsedForCredentials(Long companyId) {
        company.setId(companyId);
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.requestOtp("acme", Map.of("email", EMAIL), http)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", CODE), http)).getStatusCode().value());
        verifyNoInteractions(limits, otps, tokens);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"other-company", " acme"})
    void theServerCompanyMustMatchTheRequestedSubdomain(String storedSubdomain) {
        company.setSubdomain(storedSubdomain);
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.requestOtp("acme", Map.of("email", EMAIL), http)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", CODE), http)).getStatusCode().value());
        verifyNoInteractions(limits, otps, tokens);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" ", "not-email", "a@@example.invalid", "a@localhost", "a..b@example.invalid",
            "Person <a@example.invalid>", "a@example.invalid,b@example.invalid", "a@example.invalid\r\nBcc:b@example.invalid"})
    void invalidEmailsAreRejectedBeforeAnyLookupOrCredentialOperation(String email) {
        Map<String, String> body = new HashMap<>();
        body.put("email", email);
        body.put("otp", CODE);
        assertEquals(400, controller.requestOtp("acme", body, http).getStatusCode().value());
        assertEquals(400, controller.verifyOtp("acme", body, http).getStatusCode().value());
        verifyNoInteractions(companies, limits, otps, tokens);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"48261", "4826190", "48261x", " 482619", "482619 ", "482619\n", "+482619",
            "\u0664\u0668\u0662\u0666\u0661\u0669"})
    void invalidCodesAreNeverTrimmedIntoValidCredentials(String code) {
        Map<String, String> body = new HashMap<>();
        body.put("email", EMAIL);
        body.put("otp", code);
        var response = controller.verifyOtp("acme", body, http);
        assertEquals(400, response.getStatusCode().value());
        assertEquals(Set.of("error"), response.getBody().keySet());
        verifyNoInteractions(companies, limits, otps, tokens);
    }

    @Test
    void missingRequestBodiesFailWithoutCredentialOperations() {
        assertEquals(400, controller.requestOtp("acme", null, http).getStatusCode().value());
        assertEquals(400, controller.verifyOtp("acme", null, http).getStatusCode().value());
        verifyNoInteractions(companies, limits, otps, tokens);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {" "})
    void missingRemoteAddressesShareAnUnknownBucketRatherThanTrustingForwardedHeaders(String remoteAddr) {
        http.setRemoteAddr(remoteAddr);
        controller.requestOtp("acme", Map.of("email", EMAIL), http);
        controller.verifyOtp("acme", Map.of("email", EMAIL, "otp", CODE), http);
        verify(limits).allowOtpRequest("unknown", "7:" + EMAIL);
        verify(limits).allowAuthentication("unknown", "7:" + EMAIL, "customer-otp-verify");
    }

    @Test
    void httpVerificationUsesTheActualRequestAddressBeforeCheckingTheCode() throws Exception {
        when(otps.verifyOtp(7L, EMAIL, CODE)).thenReturn(true);
        when(tokens.generateCustomerToken(EMAIL, 7L, "acme")).thenReturn("signed-by-existing-provider");
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/portal/ACME/verify-otp")
                        .contentType("application/json").content("{\"email\":\" PERSON@EXAMPLE.INVALID \",\"otp\":\"" + CODE + "\"}")
                        .header("X-Forwarded-For", "203.0.113.99").with(request -> {
                            request.setRemoteAddr(IP);
                            return request;
                        }))
                .andExpect(status().isOk()).andExpect(jsonPath("$.token").value("signed-by-existing-provider"))
                .andExpect(jsonPath("$.email").value(EMAIL)).andExpect(jsonPath("$.companyId").value(7))
                .andExpect(jsonPath("$.otp").doesNotExist()).andExpect(jsonPath("$.mockOtp").doesNotExist());
        var order = inOrder(limits, otps, tokens);
        order.verify(limits).allowAuthentication(IP, "7:" + EMAIL, "customer-otp-verify");
        order.verify(otps).verifyOtp(7L, EMAIL, CODE);
        order.verify(tokens).generateCustomerToken(EMAIL, 7L, "acme");
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"email\":null}", "{\"email\":\"not-email\"}",
            "{\"email\":\"person@example.invalid\",\"development\":\"true\",\"token\":\"attacker\"}"})
    void demoEndpointNeverIssuesCredentialsRegardlessOfEmailOrDevelopmentFlags(String body) throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/portal/acme/demo-login").contentType("application/json").content(body)
                        .param("development", "true").header("X-Company-ID", "7"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.error").value(
                        "Demo sign-in is unavailable. Use verified email sign-in to request and verify a code."))
                .andExpect(jsonPath("$.token").doesNotExist()).andExpect(jsonPath("$.success").doesNotExist())
                .andExpect(jsonPath("$.email").doesNotExist()).andExpect(jsonPath("$.companyId").doesNotExist())
                .andExpect(header().doesNotExist("Set-Cookie")).andExpect(header().doesNotExist("Location"));
        verifyNoInteractions(companies, limits, otps, tokens);
    }

    @Test
    void demoEndpointAlsoRefusesMissingBodiesAndUnknownCompanies() throws Exception {
        var mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/portal/unknown/demo-login"))
                .andExpect(status().isGone()).andExpect(jsonPath("$.token").doesNotExist());
        assertEquals(410, controller.demoCustomerLogin(null, null).getStatusCode().value());
        verifyNoInteractions(companies, limits, otps, tokens);
    }
}
