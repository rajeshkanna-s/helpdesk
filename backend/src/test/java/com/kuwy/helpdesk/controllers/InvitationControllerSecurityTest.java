package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.InvitationValidationResponse;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.services.AgentInvitationService;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class InvitationControllerSecurityTest {
    private AgentInvitationService invitations;
    private InvitationController controller;
    private MockHttpServletRequest http;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        invitations = mock(AgentInvitationService.class);
        controller = new InvitationController(invitations);
        http = new MockHttpServletRequest();
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void anonymousAndTenantHeaderOnlyCallersCannotManageInvitations() {
        TenantContext.setCompanyId(7L);
        assertThrows(SecurityException.class, () -> controller.getPendingInvitations(7L));
        assertThrows(SecurityException.class, () -> controller.inviteAgent(new InviteAgentRequest(), 7L, http));
        assertThrows(SecurityException.class, () -> controller.resendInvitation(90L, http));
        assertThrows(SecurityException.class, () -> controller.revokeInvitation(90L, http));
        verifyNoInteractions(invitations);
    }

    @ParameterizedTest
    @ValueSource(strings = {"AGENT", "TEAM_LEAD", "LIGHT_AGENT", "CUSTOMER"})
    void nonAdministratorsCannotListOrCreateInvitations(String role) {
        TenantContext.setContext(7L, 44L, role, "actor@example.invalid");
        assertThrows(SecurityException.class, () -> controller.getPendingInvitations(7L));
        assertThrows(SecurityException.class, () -> controller.inviteAgent(new InviteAgentRequest(), 7L, http));
        verifyNoInteractions(invitations);
    }

    @Test
    void companyAdminCannotSelectAnotherTenant() {
        actor("COMPANY_ADMIN");
        assertThrows(SecurityException.class, () -> controller.getPendingInvitations(8L));
        assertThrows(SecurityException.class, () -> controller.inviteAgent(new InviteAgentRequest(), 8L, http));
        verifyNoInteractions(invitations);
    }

    @Test
    void tenantDefaultAndSuperAdminExplicitTargetArePreserved() {
        actor("COMPANY_ADMIN");
        when(invitations.getPendingInvitations(7L)).thenReturn(List.of());
        assertEquals(List.of(), controller.getPendingInvitations(null).getBody());
        verify(invitations).getPendingInvitations(7L);
        actor("SUPER_ADMIN");
        when(invitations.inviteAgent(any(), eq(44L), eq(8L), same(http)))
                .thenReturn(Map.of("success", true, "message", "Invitation email queued."));
        assertEquals(200, controller.inviteAgent(new InviteAgentRequest(), 8L, http).getStatusCode().value());
        verify(invitations).inviteAgent(any(), eq(44L), eq(8L), same(http));
    }

    @Test
    void queryStringAdminIdsCannotImpersonateAnotherActor() throws Exception {
        actor("COMPANY_ADMIN");
        when(invitations.inviteAgent(any(), eq(44L), eq(7L), any()))
                .thenReturn(Map.of("success", true, "message", "Invitation email queued.", "invitationId", 90L));
        when(invitations.resendInvitation(eq(90L), eq(44L), any()))
                .thenReturn(Map.of("success", true, "message", "Invitation email queued."));
        when(invitations.revokeInvitation(eq(90L), eq(44L), any()))
                .thenReturn(Map.of("success", true));
        MockMvc mvc = MockMvcBuilders.standaloneSetup(controller).build();
        mvc.perform(post("/api/v1/invitations/invite").param("adminUserId", "999").param("companyId", "7")
                        .contentType("application/json").content("{\"name\":\"Invited Person\",\"email\":\"invitee@example.invalid\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.message").value("Invitation email queued."))
                .andExpect(jsonPath("$.inviteUrl").doesNotExist()).andExpect(jsonPath("$.token").doesNotExist());
        mvc.perform(post("/api/v1/invitations/90/resend").param("adminUserId", "999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.inviteUrl").doesNotExist());
        mvc.perform(post("/api/v1/invitations/90/revoke").param("adminUserId", "999"))
                .andExpect(status().isOk());
        verify(invitations).inviteAgent(any(), eq(44L), eq(7L), any());
        verify(invitations).resendInvitation(eq(90L), eq(44L), any());
        verify(invitations).revokeInvitation(eq(90L), eq(44L), any());
    }

    @Test
    void serviceFailuresAreNotReplacedWithSuccessOrLocallyExposedExceptionBodies() {
        actor("COMPANY_ADMIN");
        IllegalStateException unavailable = new IllegalStateException("ACCOUNT_EMAIL_NOT_READY");
        when(invitations.inviteAgent(any(), eq(44L), eq(7L), any())).thenThrow(unavailable);
        when(invitations.resendInvitation(eq(90L), eq(44L), any())).thenThrow(unavailable);
        SecurityException denied = new SecurityException("Access denied");
        when(invitations.revokeInvitation(eq(90L), eq(44L), any())).thenThrow(denied);
        when(invitations.acceptInvitation(any(), any())).thenThrow(unavailable);
        assertSame(unavailable, assertThrows(IllegalStateException.class,
                () -> controller.inviteAgent(new InviteAgentRequest(), 7L, http)));
        assertSame(unavailable, assertThrows(IllegalStateException.class, () -> controller.resendInvitation(90L, http)));
        assertSame(denied, assertThrows(SecurityException.class, () -> controller.revokeInvitation(90L, http)));
        assertSame(unavailable, assertThrows(IllegalStateException.class,
                () -> controller.acceptInvitation(new AcceptInvitationRequest(), http)));
    }

    @Test
    void publicValidationAndAcceptanceDelegateWithoutAnAdminSession() {
        String raw = "a1".repeat(32);
        InvitationValidationResponse validation = InvitationValidationResponse.builder().valid(true).status("VALID").build();
        when(invitations.validateInvitation(raw)).thenReturn(validation);
        LoginResponse login = LoginResponse.builder().token("token-issued-by-service").build();
        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(raw);
        when(invitations.acceptInvitation(request, http)).thenReturn(login);
        assertSame(validation, controller.validateInvitation(raw).getBody());
        assertSame(login, controller.acceptInvitation(request, http).getBody());
        assertNull(TenantContext.getUserId());
    }

    private void actor(String role) {
        TenantContext.setContext(7L, 44L, role, "actor@example.invalid");
    }
}
