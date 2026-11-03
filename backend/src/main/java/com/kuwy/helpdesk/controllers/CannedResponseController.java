package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.CannedResponse;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.repositories.CannedResponseRepository;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/canned-responses")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CannedResponseController {

    private final CannedResponseRepository cannedResponseRepository;
    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;

    @GetMapping
    public ResponseEntity<List<CannedResponse>> getCannedResponses(
            @RequestParam(required = false) Long companyId
    ) {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        TenantContext.assertAccessTo(targetCompanyId);

        return ResponseEntity.ok(cannedResponseRepository.findByCompanyIdOrderByTitleAsc(targetCompanyId));
    }

    @PostMapping
    public ResponseEntity<CannedResponse> createCannedResponse(@RequestBody CannedResponseDto dto) {
        Long targetCompanyId = TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L;
        TenantContext.assertAccessTo(targetCompanyId);

        Company company = companyRepository.findById(targetCompanyId)
                .orElseThrow(() -> new RuntimeException("Company not found"));

        CannedResponse resp = new CannedResponse();
        resp.setCompany(company);
        resp.setTitle(dto.getTitle());
        resp.setShortcut(dto.getShortcut().startsWith("#") ? dto.getShortcut() : "#" + dto.getShortcut());
        resp.setContent(dto.getContent());
        resp.setIsShared(dto.getIsShared() != null ? dto.getIsShared() : true);

        if (dto.getDepartmentId() != null) {
            departmentRepository.findById(dto.getDepartmentId()).ifPresent(resp::setDepartment);
        }

        return ResponseEntity.ok(cannedResponseRepository.save(resp));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCannedResponse(@PathVariable Long id) {
        CannedResponse resp = cannedResponseRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Canned response not found: " + id));
        TenantContext.assertAccessTo(resp.getCompany().getId());

        cannedResponseRepository.delete(resp);
        return ResponseEntity.noContent().build();
    }

    @Data
    public static class CannedResponseDto {
        private String title;
        private String shortcut;
        private String content;
        private Long departmentId;
        private Boolean isShared;
    }
}
