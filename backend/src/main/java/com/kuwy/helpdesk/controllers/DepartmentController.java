package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.DepartmentCreateDto;
import com.kuwy.helpdesk.dto.DepartmentDetailDto;
import com.kuwy.helpdesk.dto.SupportEngineerCreateDto;
import com.kuwy.helpdesk.dto.SupportEngineerDto;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.services.DepartmentService;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.SupportEngineerService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/departments")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DepartmentController {

    private final DepartmentService departmentService;
    private final SupportEngineerService supportEngineerService;
    private final SubscriptionService subscriptionService;

    @GetMapping
    public ResponseEntity<List<DepartmentDetailDto>> getDepartments(@RequestParam(required = false) Long companyId) {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        TenantContext.assertAccessTo(targetCompanyId);

        return ResponseEntity.ok(departmentService.getDepartmentsWithDetails(targetCompanyId));
    }

    @PostMapping
    public ResponseEntity<Department> createDepartment(@RequestBody DepartmentCreateDto dto) {
        if (dto.getCompanyId() == null) {
            Long cid = TenantContext.getCompanyId();
            dto.setCompanyId(cid != null ? cid : 1L);
        }
        TenantContext.assertAccessTo(dto.getCompanyId());
        return ResponseEntity.ok(departmentService.createDepartment(dto));
    }

    @PatchMapping("/{id}/toggle-active")
    public ResponseEntity<Department> toggleDepartmentActive(@PathVariable Long id) {
        return ResponseEntity.ok(departmentService.toggleDepartmentActive(id));
    }

    @GetMapping("/engineers")
    public ResponseEntity<List<SupportEngineerDto>> getEngineers(@RequestParam(required = false) Long companyId) {
        Long targetCompanyId = TenantContext.isSuperAdmin() && companyId != null
                ? companyId
                : (TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L);
        TenantContext.assertAccessTo(targetCompanyId);

        return ResponseEntity.ok(supportEngineerService.getEngineersByCategory(targetCompanyId));
    }

    @PostMapping("/engineers")
    public ResponseEntity<SupportEngineerDto> createEngineer(@RequestBody SupportEngineerCreateDto dto) {
        if (dto.getCompanyId() == null) {
            Long cid = TenantContext.getCompanyId();
            dto.setCompanyId(cid != null ? cid : 1L);
        }
        TenantContext.assertAccessTo(dto.getCompanyId());

        // Enforce Agent limit per subscription tier
        subscriptionService.assertCanAddAgent(dto.getCompanyId());

        return ResponseEntity.ok(supportEngineerService.createSupportEngineer(dto));
    }

    @PatchMapping("/engineers/{userId}/toggle-active")
    public ResponseEntity<User> toggleEngineerActive(@PathVariable Long userId) {
        return ResponseEntity.ok(supportEngineerService.toggleEngineerActive(userId));
    }
}
