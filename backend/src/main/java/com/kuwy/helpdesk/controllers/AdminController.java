package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AdminOverviewDto;
import com.kuwy.helpdesk.dto.CompanyCreateAdminDto;
import com.kuwy.helpdesk.dto.UserCredentialCreateDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.AdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AdminController {

    private final AdminService adminService;

    @GetMapping("/overview")
    public ResponseEntity<AdminOverviewDto> getOverview() {
        return ResponseEntity.ok(adminService.getPlatformOverview());
    }

    @GetMapping("/companies")
    public ResponseEntity<List<AdminService.CompanyDetailDto>> listCompanies() {
        return ResponseEntity.ok(adminService.getAllCompaniesWithDetails());
    }

    @PostMapping("/companies")
    public ResponseEntity<?> createCompany(@RequestBody CompanyCreateAdminDto dto) {
        try {
            Company created = adminService.createCompanyWithAdmin(dto);
            return ResponseEntity.ok(created);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PatchMapping("/companies/{id}/status")
    public ResponseEntity<?> updateCompanyStatus(
            @PathVariable Long id,
            @RequestParam String status
    ) {
        try {
            Company.CompanyStatus newStatus = Company.CompanyStatus.valueOf(status.toUpperCase());
            Company updated = adminService.updateCompanyStatus(id, newStatus);
            return ResponseEntity.ok(updated);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PatchMapping("/companies/{id}/limits")
    public ResponseEntity<?> updateCompanyLimits(
            @PathVariable Long id,
            @RequestParam(required = false) String planName,
            @RequestParam(required = false) Integer maxAgents
    ) {
        try {
            Company updated = adminService.updateCompanyLimits(id, planName, maxAgents);
            return ResponseEntity.ok(updated);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/users")
    public ResponseEntity<List<User>> listAllUsers() {
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUserCredential(@RequestBody UserCredentialCreateDto dto) {
        try {
            User created = adminService.createUserCredential(dto);
            return ResponseEntity.ok(created);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PatchMapping("/users/{id}/toggle-active")
    public ResponseEntity<?> toggleUserActive(@PathVariable Long id) {
        try {
            User updated = adminService.toggleUserActive(id);
            return ResponseEntity.ok(updated);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/users/{id}/reset-password")
    public ResponseEntity<?> resetUserPassword(
            @PathVariable Long id,
            @RequestBody Map<String, String> body
    ) {
        try {
            String newPassword = body.getOrDefault("newPassword", "Password@123");
            adminService.resetUserPassword(id, newPassword);
            return ResponseEntity.ok(Map.of("message", "Password reset successfully."));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}
