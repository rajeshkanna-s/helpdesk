package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.repositories.RoleRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/companies/{companyId}/roles")
@RequiredArgsConstructor
public class CompanyRoleController {
    private final RoleRepository roles;

    @GetMapping
    public List<Map<String, Object>> roles(@PathVariable Long companyId) {
        TenantContext.assertCompanyAdminAccessTo(companyId);
        return roles.findByCompanyIdOrIsSystemRoleTrue(companyId).stream()
                .filter(role -> role.getRoleType() != null && role.getRoleType() != Role.RoleType.SUPER_ADMIN && role.getRoleType() != Role.RoleType.CUSTOMER)
                .filter(role -> role.getCompany() != null ? companyId.equals(role.getCompany().getId()) : Boolean.TRUE.equals(role.getIsSystemRole()))
                .map(role -> Map.<String, Object>of("id", role.getId(), "name", role.getName(), "roleType", role.getRoleType().name())).toList();
    }
}
