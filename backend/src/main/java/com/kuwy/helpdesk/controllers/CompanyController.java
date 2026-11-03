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
        return ResponseEntity.ok(companyService.getKbArticles(id));
    }

    @GetMapping("/{id}/kb-categories")
    public ResponseEntity<List<Map<String, Object>>> getKbCategories(@PathVariable Long id) {
        return ResponseEntity.ok(companyService.getKbCategories(id));
    }

    @PostMapping("/{id}/kb-articles")
    public ResponseEntity<KbArticleDto> createKbArticle(@PathVariable Long id, @RequestBody SaveKbArticleRequest req) {
        TenantContext.assertAccessTo(id);
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
        companyService.markNotificationRead(notifId);
        return ResponseEntity.ok().build();
    }

    @PostMapping("/{id}/notifications/read-all")
    public ResponseEntity<Void> markAllNotificationsRead(@PathVariable Long id) {
        TenantContext.assertAccessTo(id);
        companyService.markAllNotificationsRead(id);
        return ResponseEntity.ok().build();
    }
}
