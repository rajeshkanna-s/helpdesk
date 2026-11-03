package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.CompanyService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
        return ResponseEntity.ok(companyService.getDepartments(id));
    }

    @GetMapping("/{id}/agents")
    public ResponseEntity<List<User>> getAgents(@PathVariable Long id) {
        return ResponseEntity.ok(companyService.getAgents(id));
    }
}
