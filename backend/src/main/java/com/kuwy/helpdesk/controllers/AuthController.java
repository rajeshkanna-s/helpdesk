package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.LoginRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.services.AuthService;
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

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        try {
            LoginResponse response = authService.login(request);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of(
                    "error", ex.getMessage(),
                    "timestamp", java.time.LocalDateTime.now().toString()
            ));
        }
    }
}
