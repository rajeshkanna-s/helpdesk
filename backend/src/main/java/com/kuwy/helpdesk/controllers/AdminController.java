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


    // =========================================================================
    // SECTION F: SUPER ADMIN CONTROL ENDPOINTS (SCREENS 40 TO 43)
    // =========================================================================

    @GetMapping("/plans")
    public ResponseEntity<List<Map<String, Object>>> getPlatformPlans() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getPlatformPlans());
    }

    @GetMapping("/coupons")
    public ResponseEntity<List<Map<String, Object>>> getCoupons() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getCoupons());
    }

    @GetMapping("/email-health")
    public ResponseEntity<Map<String, Object>> getEmailSystemHealth() {
        assertSuperAdmin();
        return ResponseEntity.ok(adminService.getEmailSystemHealth());
    }

    @PostMapping("/companies/{id}/extend-trial")
    public ResponseEntity<?> extendCompanyTrial(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        assertSuperAdmin();
        int days = body.get("days") != null ? Integer.parseInt(String.valueOf(body.get("days"))) : 14;
        String reason = String.valueOf(body.getOrDefault("reason", "Extended by platform administrator"));
        Company updated = adminService.extendCompanyTrial(id, days, reason);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/companies/{id}/suspend")
    public ResponseEntity<?> suspendCompany(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        assertSuperAdmin();
        String reason = String.valueOf(body.getOrDefault("reason", "Administrative hold"));
        Company updated = adminService.suspendCompany(id, reason);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/companies/{id}/impersonate")
    public ResponseEntity<?> startSupportSession(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body
    ) {
        assertSuperAdmin();
        String staff = String.valueOf(body.getOrDefault("staffName", "Super Admin Staff"));
        String reason = String.valueOf(body.getOrDefault("reason", "Customer troubleshooting support"));
        Map<String, Object> session = adminService.startSupportSession(id, staff, reason);
        return ResponseEntity.ok(session);
    }

    @DeleteMapping("/companies/{id}")
    public ResponseEntity<?> deleteCompany(
            @PathVariable Long id,
            @RequestParam String confirmationName
    ) {
        assertSuperAdmin();
        try {
            adminService.softDeleteCompany(id, confirmationName);
            return ResponseEntity.ok(Map.of("message", "Company queued for deletion with 30-day grace hold."));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

}
