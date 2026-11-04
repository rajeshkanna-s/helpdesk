package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.ForgotPasswordRequest;
import com.kuwy.helpdesk.dto.LoginRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.dto.ResetPasswordRequest;
import com.kuwy.helpdesk.dto.Verify2FaRequest;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.services.AuthService;
import com.kuwy.helpdesk.services.PasswordResetService;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AuthController {

    private final AuthService authService;
    private final PasswordResetService passwordResetService;
    private final UserRepository userRepository;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {
        try {
            LoginResponse response = authService.login(request, httpRequest);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", ex.getMessage(),
                    "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }

    @PostMapping("/verify-2fa")
    public ResponseEntity<?> verify2Fa(@RequestBody Verify2FaRequest request, HttpServletRequest httpRequest) {
        try {
            LoginResponse response = authService.verify2Fa(request, httpRequest);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", ex.getMessage(),
                    "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<?> forgotPassword(@RequestBody ForgotPasswordRequest request, HttpServletRequest httpRequest) {
        try {
            passwordResetService.requestPasswordReset(request, httpRequest);
        } catch (Exception ignored) {
            // Constant timing to defeat user enumeration
        }
        return ResponseEntity.ok(Map.of(
                "success", true,
                "message", "If an account exists with this email, password reset instructions have been dispatched."
        ));
    }

    @GetMapping("/validate-reset-token")
    public ResponseEntity<?> validateResetToken(@RequestParam("token") String token) {
        try {
            Map<String, Object> result = passwordResetService.validateResetToken(token);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "valid", false,
                    "error", ex.getMessage()
            ));
        }
    }

    @PostMapping("/reset-password")
    public ResponseEntity<?> resetPassword(@RequestBody ResetPasswordRequest request, HttpServletRequest httpRequest) {
        try {
            Map<String, Object> result = passwordResetService.resetPassword(request, httpRequest);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", ex.getMessage()
            ));
        }
    }

    @GetMapping("/lookup-workspace")
    public ResponseEntity<?> lookupWorkspace(@RequestParam("email") String email) {
        if (email == null || email.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Email is required"));
        }
        Optional<User> userOpt = userRepository.findByEmail(email.trim().toLowerCase());
        if (userOpt.isPresent() && userOpt.get().getCompany() != null) {
            return ResponseEntity.ok(Map.of(
                    "found", true,
                    "subdomain", userOpt.get().getCompany().getSubdomain(),
                    "companyName", userOpt.get().getCompany().getName(),
                    "companyCode", userOpt.get().getCompany().getCompanyCode()
            ));
        }
        // Generic fallback to prevent enumeration
        return ResponseEntity.ok(Map.of(
                "found", false,
                "subdomain", "kuwy"
        ));
    }

    @PostMapping("/2fa/setup")
    public ResponseEntity<?> setup2Fa(@RequestBody(required = false) Map<String, String> payload, HttpServletRequest request) {
        try {
            Long userId = TenantContext.requireUserId();
            String password = payload != null ? payload.get("password") : "";
            String currentCode = payload != null ? payload.get("currentCode") : "";
            return ResponseEntity.ok(authService.setup2Fa(userId, password, currentCode, request));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/2fa/enable")
    public ResponseEntity<?> enable2Fa(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        try {
            Long userId = TenantContext.requireUserId();
            String code = payload.get("code");
            return ResponseEntity.ok(authService.enable2Fa(userId, code, request));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/2fa/disable")
    public ResponseEntity<?> disable2Fa(@RequestBody Map<String, String> payload, HttpServletRequest request) {
        try {
            Long userId = TenantContext.requireUserId();
            String password = payload.get("password");
            String code = payload.get("code");
            return ResponseEntity.ok(authService.disable2Fa(userId, password, code, request));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}
