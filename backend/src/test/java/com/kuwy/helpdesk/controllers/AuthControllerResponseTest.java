package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.services.AuthService;
import com.kuwy.helpdesk.services.PasswordResetService;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Map;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthControllerResponseTest {
    private AuthService authentication;
    private PasswordResetService recovery;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        authentication = mock(AuthService.class);
        recovery = mock(PasswordResetService.class);
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(authentication, recovery, mock(BrowserSessionService.class), mock(BrowserSessionCookies.class)))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
        TenantContext.clear();
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void failedCredentialsReturnAuthenticationFailureWithoutInfrastructureDetails() throws Exception {
        when(authentication.login(any(), any())).thenThrow(new BadCredentialsException("Email or password is incorrect."));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"person@example.invalid\",\"password\":\"synthetic passphrase\"}"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("Email or password is incorrect."));
    }

    @Test
    void recoveryDoesNotClaimSuccessWhenEmailIsUnavailable() throws Exception {
        when(recovery.requestPasswordReset(any(), any())).thenThrow(new IllegalStateException("ACCOUNT_EMAIL_NOT_READY"));
        mvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"person@example.invalid\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.success").doesNotExist())
                .andExpect(content().string(not(containsString("dispatched"))));
    }

    @Test
    void recoveryRateLimitIsExplicitAndDoesNotPretendToQueue() throws Exception {
        when(recovery.requestPasswordReset(any(), any())).thenThrow(new IllegalStateException("PASSWORD_RESET_RATE_LIMITED"));
        mvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"person@example.invalid\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "60"));
    }

    @Test
    void successfulRecoveryReturnsOnlyTheUniformServiceResponse() throws Exception {
        when(recovery.requestPasswordReset(any(), any())).thenReturn(Map.of("success", true, "message", "If eligible, a reset email has been queued."));
        mvc.perform(post("/api/v1/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"person@example.invalid\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.devResetUrl").doesNotExist()).andExpect(jsonPath("$.token").doesNotExist());
    }

    @Test
    void tokenValidationUsesTheBodyRatherThanTheRequestUrl() throws Exception {
        when(recovery.validateResetToken("synthetic-token")).thenReturn(Map.of("valid", false, "status", "NOT_FOUND"));
        mvc.perform(post("/api/v1/auth/validate-reset-token").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"synthetic-token\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.valid").value(false));
        verify(recovery).validateResetToken("synthetic-token");
    }

    @Test
    void mfaManagementUsesTheAuthenticatedActorNotPayloadUserId() throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "person@example.invalid");
        when(authentication.enable2Fa(eq(11L), eq("246810"), any())).thenReturn(Map.of("success", true));
        mvc.perform(post("/api/v1/auth/2fa/enable").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userId\":\"999\",\"code\":\"246810\"}"))
                .andExpect(status().isOk());
        verify(authentication).enable2Fa(eq(11L), eq("246810"), any());
        verify(authentication, never()).enable2Fa(eq(999L), anyString(), any());
    }

    @Test
    void unauthenticatedMfaManagementDoesNotReachTheService() throws Exception {
        mvc.perform(post("/api/v1/auth/2fa/disable").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"password\":\"synthetic passphrase\",\"code\":\"246810\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(authentication);
    }

    @Test
    void validationAndUnexpectedErrorsDoNotEchoCredentials() throws Exception {
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"invalid\",\"password\":\"synthetic-private-value\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.email").exists())
                .andExpect(content().string(not(containsString("synthetic-private-value"))));
        when(authentication.login(any(), any())).thenThrow(new IllegalStateException("synthetic-private-infrastructure-detail"));
        mvc.perform(post("/api/v1/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"person@example.invalid\",\"password\":\"synthetic passphrase\"}"))
                .andExpect(status().isLocked())
                .andExpect(content().string(not(containsString("synthetic-private-infrastructure-detail"))));
    }
}
