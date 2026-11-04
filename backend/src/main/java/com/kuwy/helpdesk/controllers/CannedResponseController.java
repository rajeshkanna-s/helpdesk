package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.CannedResponse;
import com.kuwy.helpdesk.repositories.CannedResponseRepository;
import com.kuwy.helpdesk.services.CompanyService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/canned-responses")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class CannedResponseController {

    private final CannedResponseRepository cannedResponseRepository;
    private final CompanyService companyService;

    @GetMapping
    public ResponseEntity<List<CannedResponse>> getCannedResponses(
            @RequestParam(required = false) Long companyId
    ) {
        Long targetCompanyId = companyId != null ? companyId : TenantContext.getCompanyId();
        TenantContext.assertAccessTo(targetCompanyId);

        return ResponseEntity.ok(companyService.getCannedResponses(targetCompanyId));
    }

    @PostMapping
    public ResponseEntity<CannedResponse> createCannedResponse(@RequestBody CannedResponseDto dto) {
        Long targetCompanyId = TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(targetCompanyId);
        if (dto.getShortcut() == null || dto.getShortcut().isBlank()) {
            throw new IllegalArgumentException("A canned response shortcut is required.");
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("title", dto.getTitle());
        payload.put("shortcut", dto.getShortcut().startsWith("#") ? dto.getShortcut() : "#" + dto.getShortcut());
        payload.put("content", dto.getContent());
        payload.put("isShared", dto.getIsShared() != null ? dto.getIsShared() : true);
        payload.put("departmentId", dto.getDepartmentId());
        return ResponseEntity.ok(companyService.saveCannedResponse(targetCompanyId, payload));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteCannedResponse(@PathVariable Long id) {
        TenantContext.requireUserId();
        CannedResponse resp = cannedResponseRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Canned response not found: " + id));
        Long companyId = resp.getCompany() != null ? resp.getCompany().getId() : null;
        TenantContext.assertCompanyAdminAccessTo(companyId);

        companyService.deleteCannedResponse(companyId, id);
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
