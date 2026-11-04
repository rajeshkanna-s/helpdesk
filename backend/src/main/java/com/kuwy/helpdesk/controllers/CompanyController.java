package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.CustomerContactDto;
import com.kuwy.helpdesk.dto.KbArticleDto;
import com.kuwy.helpdesk.dto.SaveKbArticleRequest;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Notification;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.CompanyService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/companies")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CompanyController {

    private final CompanyService companyService;

    @GetMapping
    public ResponseEntity<List<Company>> listCompanies() {
        return ResponseEntity.ok(companyService.getAllCompanies());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Company> getCompany(@PathVariable Long id) {
        return ResponseEntity.ok(companyService.getCompanyById(id));
    }

    @GetMapping("/by-subdomain/{subdomain}")
    public ResponseEntity<Company> getBySubdomain(@PathVariable String subdomain) {
        return ResponseEntity.ok(companyService.getCompanyBySubdomain(subdomain));
    }

    @GetMapping("/{id}/departments")
    public ResponseEntity<List<Department>> getDepartments(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getDepartments(id));
    }

    @GetMapping("/{id}/agents")
    public ResponseEntity<List<User>> getAgents(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getAgents(id));
    }

    @GetMapping("/{id}/kb-articles")
    public ResponseEntity<List<KbArticleDto>> getKbArticles(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getKbArticles(id));
    }

    @GetMapping("/{id}/kb-categories")
    public ResponseEntity<List<Map<String, Object>>> getKbCategories(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getKbCategories(id));
    }

    @PostMapping("/{id}/kb-articles")
    public ResponseEntity<KbArticleDto> createKbArticle(@PathVariable Long id, @RequestBody SaveKbArticleRequest req) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.createKbArticle(id, req));
    }

    @GetMapping("/{id}/customers")
    public ResponseEntity<List<CustomerContactDto>> getCustomers(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getCustomers(id));
    }

    @PostMapping("/{id}/customers")
    public ResponseEntity<CustomerContactDto> createCustomer(@PathVariable Long id, @RequestBody CustomerContactDto req) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.createCustomer(id, req));
    }

    @GetMapping("/{id}/notifications")
    public ResponseEntity<List<Notification>> getNotifications(@PathVariable Long id, @RequestParam(required = false) Long userId) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getNotifications(id, userId));
    }

    @PostMapping("/{id}/notifications/{notifId}/read")
    public ResponseEntity<Void> markNotificationRead(@PathVariable Long id, @PathVariable Long notifId) {
        TenantContext.assertAccessTo(id);
        companyService.markNotificationRead(id, notifId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/notifications/read-all")
    public ResponseEntity<Void> markAllNotificationsRead(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        companyService.markAllNotificationsRead(id);
        return ResponseEntity.ok().build();
    }


    // =========================================================================
    // SECTION E: ADMIN SETTINGS ENDPOINTS (SCREENS 25 TO 39)
    // =========================================================================

    @GetMapping("/{id}/settings")
    public ResponseEntity<Map<String, Object>> getCompanySettings(@PathVariable Long id) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.getCompanySettings(id));
    }

    @PutMapping("/{id}/settings")
    public ResponseEntity<Map<String, Object>> updateCompanySettings(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.updateCompanySettings(id, payload));
    }

    @GetMapping("/{id}/audit-logs")
    public ResponseEntity<List<com.kuwy.helpdesk.models.SecurityAuditLog>> getAuditLogs(@PathVariable Long id) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.getAuditLogs(id));
    }

    @GetMapping("/{id}/mailboxes")
    public ResponseEntity<List<com.kuwy.helpdesk.models.CompanyMailbox>> getMailboxes(@PathVariable Long id) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.getCompanyMailboxes(id));
    }

    @PostMapping("/{id}/mailboxes")
    public ResponseEntity<com.kuwy.helpdesk.models.CompanyMailbox> saveMailbox(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.saveCompanyMailbox(id, payload));
    }

    @DeleteMapping("/{id}/mailboxes/{mailboxId}")
    public ResponseEntity<Void> deleteMailbox(@PathVariable Long id, @PathVariable Long mailboxId) {
        TenantContext.assertCompanyAdminAccessTo(id);
        companyService.deleteCompanyMailbox(id, mailboxId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{id}/canned-responses")
    public ResponseEntity<List<com.kuwy.helpdesk.models.CannedResponse>> getCannedResponses(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        return ResponseEntity.ok(companyService.getCannedResponses(id));
    }

    @PostMapping("/{id}/canned-responses")
    public ResponseEntity<com.kuwy.helpdesk.models.CannedResponse> saveCannedResponse(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.saveCannedResponse(id, payload));
    }

    @DeleteMapping("/{id}/canned-responses/{responseId}")
    public ResponseEntity<Void> deleteCannedResponse(@PathVariable Long id, @PathVariable Long responseId) {
        TenantContext.assertCompanyAdminAccessTo(id);
        companyService.deleteCannedResponse(id, responseId);
        return ResponseEntity.ok().build();
    }

    @GetMapping("/{id}/automation-rules")
    public ResponseEntity<List<com.kuwy.helpdesk.models.AutomationRule>> getAutomationRules(@PathVariable Long id) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.getAutomationRules(id));
    }

    @PostMapping("/{id}/automation-rules")
    public ResponseEntity<com.kuwy.helpdesk.models.AutomationRule> saveAutomationRule(@PathVariable Long id, @RequestBody Map<String, Object> payload) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.saveAutomationRule(id, payload));
    }

    @PostMapping("/{id}/reauth")
    public ResponseEntity<Map<String, Object>> reauthenticate(@PathVariable Long id, @RequestBody Map<String, String> body) {
        TenantContext.assertCompanyAdminAccessTo(id);
        String password = body.get("password");
        boolean ok = companyService.reauthenticate(id, TenantContext.requireUserId(), password);
        return ResponseEntity.ok(Map.of("success", ok, "message", ok ? "Re-authentication verified" : "Invalid credentials for sensitive action"));
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<Map<String, Object>> exportData(@PathVariable Long id) {
        TenantContext.assertCompanyAdminAccessTo(id);
        return ResponseEntity.ok(companyService.exportWorkspaceData(id));
    }
}
