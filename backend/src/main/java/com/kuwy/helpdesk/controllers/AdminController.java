package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AdminOverviewDto;
import com.kuwy.helpdesk.dto.CompanyCreateAdminDto;
import com.kuwy.helpdesk.dto.UserCredentialCreateDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.AdminService;
import com.kuwy.helpdesk.tenant.TenantContext;
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

    private void assertSuperAdmin() {
        if (!TenantContext.isSuperAdmin()) {
            throw new SecurityException("Forbidden: Only Platform Super Admin can access Admin Console control endpoints.");
        }
    }

    @GetMapping("/overview")
    public ResponseEntity<AdminOverviewDto> getOverview() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getPlatformOverview());
    }

    @GetMapping("/companies")
    public ResponseEntity<List<AdminService.CompanyDetailDto>> listCompanies() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getAllCompaniesWithDetails());
    }

    @PostMapping("/companies")
    public ResponseEntity<?> createCompany(@RequestBody CompanyCreateAdminDto dto) {
        assertSuperAdmin();
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
        assertSuperAdmin();
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
        assertSuperAdmin();
        try {
            Company updated = adminService.updateCompanyLimits(id, planName, maxAgents);
            return ResponseEntity.ok(updated);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping("/users")
    public ResponseEntity<List<User>> listAllUsers() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getAllUsers());
    }

    @PostMapping("/users")
    public ResponseEntity<?> createUserCredential(@RequestBody UserCredentialCreateDto dto) {
        assertSuperAdmin();
        try {
            User created = adminService.createUserCredential(dto);
            return ResponseEntity.ok(created);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PatchMapping("/users/{id}/toggle-active")
    public ResponseEntity<?> toggleUserActive(@PathVariable Long id) {
        assertSuperAdmin();
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
        assertSuperAdmin();
        try {
            String newPassword = body.getOrDefault("newPassword", "Password@123");
            adminService.resetUserPassword(id, newPassword);
            return ResponseEntity.ok(Map.of("message", "Password reset successfully."));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}
