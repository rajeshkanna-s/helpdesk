package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.AgentInvitationDto;
import com.kuwy.helpdesk.dto.InvitationValidationResponse;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.services.AgentInvitationService;
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
        try {
            LoginResponse response = invitationService.acceptInvitation(request, httpRequest);
            return ResponseEntity.ok(response);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @GetMapping
    public ResponseEntity<List<AgentInvitationDto>> getPendingInvitations(
            @RequestParam(value = "companyId", defaultValue = "1") Long companyId) {
        List<AgentInvitationDto> list = invitationService.getPendingInvitations(companyId);
        return ResponseEntity.ok(list);
    }

    @PostMapping("/invite")
    public ResponseEntity<?> inviteAgent(
            @RequestBody InviteAgentRequest request,
            @RequestParam(value = "adminUserId", defaultValue = "1") Long adminUserId,
            @RequestParam(value = "companyId", defaultValue = "1") Long companyId,
            HttpServletRequest httpRequest) {
        try {
            Map<String, Object> result = invitationService.inviteAgent(request, adminUserId, companyId, httpRequest);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/{id}/resend")
    public ResponseEntity<?> resendInvitation(
            @PathVariable("id") Long id,
            @RequestParam(value = "adminUserId", defaultValue = "1") Long adminUserId,
            HttpServletRequest httpRequest) {
        try {
            Map<String, Object> result = invitationService.resendInvitation(id, adminUserId, httpRequest);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }

    @PostMapping("/{id}/revoke")
    public ResponseEntity<?> revokeInvitation(
            @PathVariable("id") Long id,
            @RequestParam(value = "adminUserId", defaultValue = "1") Long adminUserId,
            HttpServletRequest httpRequest) {
        try {
            Map<String, Object> result = invitationService.revokeInvitation(id, adminUserId, httpRequest);
            return ResponseEntity.ok(result);
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
        }
    }
}

