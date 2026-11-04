package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.AgentInvitationDto;
import com.kuwy.helpdesk.dto.InvitationValidationResponse;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.services.AgentInvitationService;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/invitations")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class InvitationController {

    private final AgentInvitationService invitationService;

    @GetMapping("/validate")
    public ResponseEntity<InvitationValidationResponse> validateInvitation(@RequestParam("token") String token) {
        InvitationValidationResponse response = invitationService.validateInvitation(token);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/accept")
    public ResponseEntity<?> acceptInvitation(@RequestBody AcceptInvitationRequest request, HttpServletRequest httpRequest) {
        LoginResponse response = invitationService.acceptInvitation(request, httpRequest);
        return ResponseEntity.ok(response);
    }

    @GetMapping
    public ResponseEntity<List<AgentInvitationDto>> getPendingInvitations(
            @RequestParam(value = "companyId", required = false) Long companyId) {
        Long targetCompanyId = companyId != null ? companyId : TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(targetCompanyId);
        List<AgentInvitationDto> list = invitationService.getPendingInvitations(targetCompanyId);
        return ResponseEntity.ok(list);
    }

    @PostMapping("/invite")
    public ResponseEntity<?> inviteAgent(
            @RequestBody InviteAgentRequest request,
            @RequestParam(value = "companyId", required = false) Long companyId,
            HttpServletRequest httpRequest) {
        Long adminUserId = TenantContext.requireUserId();
        Long targetCompanyId = companyId != null ? companyId : TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(targetCompanyId);
        Map<String, Object> result = invitationService.inviteAgent(request, adminUserId, targetCompanyId, httpRequest);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/resend")
    public ResponseEntity<?> resendInvitation(
            @PathVariable("id") Long id,
            HttpServletRequest httpRequest) {
        Long adminUserId = TenantContext.requireUserId();
        Map<String, Object> result = invitationService.resendInvitation(id, adminUserId, httpRequest);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/{id}/revoke")
    public ResponseEntity<?> revokeInvitation(
            @PathVariable("id") Long id,
            HttpServletRequest httpRequest) {
        Long adminUserId = TenantContext.requireUserId();
        Map<String, Object> result = invitationService.revokeInvitation(id, adminUserId, httpRequest);
        return ResponseEntity.ok(result);
    }
}
