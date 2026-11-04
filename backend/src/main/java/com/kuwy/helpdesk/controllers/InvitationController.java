package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.AgentInvitationDto;
import com.kuwy.helpdesk.dto.InvitationValidationResponse;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.services.AgentInvitationService;
import com.kuwy.helpdesk.services.BrowserSessionService;
import com.kuwy.helpdesk.config.BrowserSessionCookies;
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
    private final BrowserSessionService sessions;
    private final BrowserSessionCookies cookies;

    @PostMapping("/validate")
    public ResponseEntity<InvitationValidationResponse> validateInvitation(@RequestBody Map<String, String> request) {
        InvitationValidationResponse response = invitationService.validateInvitation(request != null ? request.get("token") : null);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/accept")
    public ResponseEntity<?> acceptInvitation(@RequestBody AcceptInvitationRequest request, HttpServletRequest httpRequest) {
        boolean browser = "1".equals(httpRequest.getHeader("X-Browser-Session"));
        if (browser) cookies.requireBrowserMutation(httpRequest);
        LoginResponse response = invitationService.acceptInvitation(request, httpRequest);
        if (browser && response.getToken() != null && !Boolean.TRUE.equals(response.getTwoFactorRequired())) {
            var session = sessions.openStaff(response.getToken(), false, httpRequest);
            response.setToken(null);
            response.setBrowserSession(true);
            response.setCsrfToken(session.csrfToken());
            response.setSessionId(session.sessionId());
            return ResponseEntity.ok().headers(cookies.issue(session, "STAFF")).body(response);
        }
        return ResponseEntity.ok().headers(BrowserSessionCookies.noStore()).body(response);
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
