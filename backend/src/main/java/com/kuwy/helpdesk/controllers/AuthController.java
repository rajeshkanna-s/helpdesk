package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.LoginRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.dto.Verify2FaRequest;
import com.kuwy.helpdesk.services.AuthService;
import com.kuwy.helpdesk.services.PasswordResetService;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final BrowserSessionService sessions;
    private final BrowserSessionCookies cookies;

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        if ("1".equals(httpRequest.getHeader("X-Browser-Session"))) cookies.requireBrowserMutation(httpRequest);
        return authenticatedResponse(authService.login(request, httpRequest), httpRequest);
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verify2Fa(@Valid @RequestBody Verify2FaRequest request, HttpServletRequest httpRequest) {
        if ("1".equals(httpRequest.getHeader("X-Browser-Session"))) cookies.requireBrowserMutation(httpRequest);
        return authenticatedResponse(authService.verify2Fa(request, httpRequest), httpRequest);
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(passwordResetService.requestPasswordReset(request, httpRequest));
    }

    @PostMapping("/validate-reset-token")
    public ResponseEntity<?> validateResetToken(@RequestBody Map<String, String> payload) {
        return ResponseEntity.ok(passwordResetService.validateResetToken(payload.get("token")));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request, HttpServletRequest httpRequest) {
        return ResponseEntity.ok(passwordResetService.resetPassword(request, httpRequest));
    }

    @GetMapping("/lookup-workspace")
    public ResponseEntity<?> lookupWorkspace(@RequestParam("email") String email) {
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        // Public email lookups must not disclose workspace membership.
        return ResponseEntity.ok(Map.of(
                "found", false,
                "subdomain", "",
                "message", "Enter your workspace address, or sign in with your email and password."
        ));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup2Fa(@RequestBody(required = false) Map<String, String> payload, HttpServletRequest request) {
        Long userId = TenantContext.requireUserId();
        String password = payload != null ? payload.get("password") : "";
        String currentCode = payload != null ? payload.get("currentCode") : "";
        return ResponseEntity.ok(authService.setup2Fa(userId, password, currentCode, request));
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<?> enable2Fa(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        return ResponseEntity.ok(authService.enable2Fa(TenantContext.requireUserId(), payload.get("code"), request));
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable2Fa(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        return ResponseEntity.ok(authService.disable2Fa(TenantContext.requireUserId(), payload.get("password"), payload.get("code"), request));
    }

    private ResponseEntity<LoginResponse> authenticatedResponse(LoginResponse result, HttpServletRequest request) {
        if (!"1".equals(request.getHeader("X-Browser-Session")) || Boolean.TRUE.equals(result.getTwoFactorRequired())) {
            return ResponseEntity.ok().headers(BrowserSessionCookies.noStore()).body(result);
        }
        var session = sessions.openStaff(result.getToken(), false, request);
        result.setToken(null);
        result.setBrowserSession(true);
        result.setCsrfToken(session.csrfToken());
        result.setSessionId(session.sessionId());
        return ResponseEntity.ok().headers(cookies.issue(session, "STAFF")).body(result);
    }

    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        return ResponseEntity.ok().headers(cookies.clear("STAFF"))
                .body(authService.changeOwnPassword(payload.get("currentPassword"), payload.get("newPassword"), payload.get("code"), request));
    }
}
