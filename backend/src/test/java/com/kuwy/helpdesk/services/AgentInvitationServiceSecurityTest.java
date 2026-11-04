package com.kuwy.helpdesk.services;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.AcceptInvitationRequest;
import com.kuwy.helpdesk.dto.InviteAgentRequest;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.models.AgentInvitation;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.CompanySubscription;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.AgentInvitationRepository;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.CompanySubscriptionRepository;
import com.kuwy.helpdesk.repositories.RoleRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PessimisticLockException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class AgentInvitationServiceSecurityTest {
    private static final String EMAIL = "invitee@example.invalid";
    private static final String RAW_TOKEN = "b2".repeat(32);
    private static final String PASSPHRASE = "orchards beside quiet rivers";
    private AgentInvitationRepository invitations;
    private UserRepository users;
    private CompanyRepository companies;
    private RoleRepository roles;
    private PasswordEncoder passwords;
    private JwtTokenProvider jwt;
    private SecurityAuditService audits;
    private AccountEmailService emails;
    private EntityManager entityManager;
    private CompanySubscriptionRepository subscriptions;
    private AgentInvitationService service;
    private Company company;
    private CompanySubscription subscription;
    private Role role;
    private User actor;
    private AgentInvitation invitation;
    private MockHttpServletRequest http;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        invitations = mock(AgentInvitationRepository.class);
        users = mock(UserRepository.class);
        companies = mock(CompanyRepository.class);
        roles = mock(RoleRepository.class);
        passwords = mock(PasswordEncoder.class);
        jwt = mock(JwtTokenProvider.class);
        audits = mock(SecurityAuditService.class);
        emails = mock(AccountEmailService.class);
        entityManager = mock(EntityManager.class);
        subscriptions = mock(CompanySubscriptionRepository.class);
        service = newService(jwt);
        http = new MockHttpServletRequest();
        http.setRemoteAddr("192.0.2.20");
        http.addHeader("Host", "attacker.example.invalid");

        company = company(7L);
        company.setName("Workspace <b>Seven</b>");
        subscription = new CompanySubscription();
        subscription.setCompany(company);
        subscription.setAgentLimit(5);
        role = role(2L, Role.RoleType.AGENT, company);
        role.setName("Support <i>Agent</i>");
        actor = new User();
        actor.setId(44L);
        actor.setCompany(company);
        actor.setRole(role(3L, Role.RoleType.COMPANY_ADMIN, company));
        actor.setEmail("admin@example.invalid");
        actor.setDisplayName("Current Admin");
        invitation = invitation(90L, AgentInvitation.InvitationStatus.PENDING);
        TenantContext.setContext(7L, 44L, "COMPANY_ADMIN", actor.getEmail());

        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(subscriptions.findByCompanyId(7L)).thenReturn(Optional.of(subscription));
        when(users.findById(44L)).thenReturn(Optional.of(actor));
        when(roles.findById(2L)).thenReturn(Optional.of(role));
        when(roles.findByCompanyIdAndRoleType(7L, Role.RoleType.AGENT)).thenReturn(Optional.of(role));
        when(invitations.findCompanyIdByInvitationId(90L)).thenReturn(Optional.of(7L));
        when(invitations.findForUpdateByIdAndCompanyId(90L, 7L)).thenReturn(Optional.of(invitation));
        when(invitations.findCompanyIdByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(7L));
        when(invitations.findForConsumptionByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(invitation));
        when(invitations.findByTokenHash(hash(RAW_TOKEN))).thenReturn(Optional.of(invitation));
        AtomicLong nextId = new AtomicLong(100);
        when(invitations.save(any(AgentInvitation.class))).thenAnswer(call -> {
            AgentInvitation saved = call.getArgument(0);
            if (saved.getId() == null) saved.setId(nextId.incrementAndGet());
            return saved;
        });
        when(users.save(any(User.class))).thenAnswer(call -> {
            User saved = call.getArgument(0);
            if (saved.getId() == null) saved.setId(55L);
            return saved;
        });
        when(passwords.encode(anyString())).thenReturn("encoded-invited-password");
        when(jwt.generateToken(any(User.class))).thenReturn("provider-issued-staff-token");
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void invitationQueuesEscapedEmailWithoutReturningOrLoggingTheLink() {
        InviteAgentRequest request = invite();
        request.setName("Ava <b>River</b>");
        Logger logger = (Logger) LoggerFactory.getLogger(AgentInvitationService.class);
        ListAppender<ILoggingEvent> logs = new ListAppender<>();
        logs.start();
        logger.addAppender(logs);
        try {
            Map<String, Object> result = service.inviteAgent(request, 44L, 7L, http);
            ArgumentCaptor<AgentInvitation> saved = ArgumentCaptor.forClass(AgentInvitation.class);
            ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
            ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
            verify(invitations).save(saved.capture());
            verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), html.capture(), key.capture());
            String raw = extractToken(html.getValue());
            assertEquals(hash(raw), saved.getValue().getTokenHash());
            assertNotEquals(raw, saved.getValue().getTokenHash());
            assertEquals(44L, saved.getValue().getInvitedByUserId());
            assertEquals(7L, saved.getValue().getCompanyId());
            assertEquals(2L, saved.getValue().getRoleId());
            assertEquals(EMAIL, saved.getValue().getEmail());
            assertEquals(AgentInvitation.InvitationStatus.PENDING, saved.getValue().getStatus());
            assertTrue(saved.getValue().getExpiresAt().isAfter(LocalDateTime.now().plusDays(6)));
            assertTrue(saved.getValue().getExpiresAt().isBefore(LocalDateTime.now().plusDays(7).plusSeconds(1)));
            assertTrue(html.getValue().contains("https://desk.example.invalid/help&amp;support/accept-invitation#token=" + raw));
            assertTrue(html.getValue().contains("Ava &lt;b&gt;River&lt;/b&gt;"));
            assertTrue(html.getValue().contains("Workspace &lt;b&gt;Seven&lt;/b&gt;"));
            assertTrue(html.getValue().contains("Support &lt;i&gt;Agent&lt;/i&gt;"));
            assertFalse(html.getValue().contains("attacker.example.invalid"));
            assertEquals("agent-invitation:101:created", key.getValue());
            assertFalse(key.getValue().contains(raw));
            assertFalse(key.getValue().contains(saved.getValue().getTokenHash()));
            assertEquals(Set.of("success", "message", "invitationId"), result.keySet());
            assertEquals("Invitation email queued.", result.get("message"));
            assertFalse(result.toString().contains(raw));
            assertFalse(result.toString().contains(saved.getValue().getTokenHash()));
            assertTrue(logs.list.stream().noneMatch(event -> event.getFormattedMessage().contains(raw)
                    || event.getFormattedMessage().contains("accept-invitation#token=")));
            verify(audits).recordEvent(eq(7L), eq(44L), eq("INVITATION_QUEUED"), eq(EMAIL),
                    eq("Invitation email queued; link valid for seven days."), same(http));
        } finally {
            logger.detachAppender(logs);
            logs.stop();
        }
    }

    @Test
    void allSeatDecisionsAndWritesFollowTheCompanyWriteLock() {
        service.inviteAgent(invite(), 44L, 7L, http);
        var order = inOrder(entityManager, users, subscriptions, invitations, emails);
        order.verify(emails).requireReady();
        order.verify(entityManager).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        order.verify(users).findForAuthenticationByCompanyAndEmail(7L, EMAIL);
        order.verify(subscriptions).findByCompanyId(7L);
        order.verify(users).countByCompanyIdAndIsActiveTrue(7L);
        order.verify(invitations).countLiveInvitationsExcludingEmail(eq(7L), eq(AgentInvitation.InvitationStatus.PENDING),
                any(LocalDateTime.class), eq(EMAIL));
        order.verify(invitations).save(any(AgentInvitation.class));
        order.verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), anyString(), anyString());
    }

    @Test
    void unavailableEmailNeverIssuesOrRotatesAnInvitation() {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_NOT_READY")).when(emails).requireReady();
        String oldHash = invitation.getTokenHash();
        assertThrows(IllegalStateException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        assertEquals(oldHash, invitation.getTokenHash());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(audits, passwords, jwt);
    }

    @Test
    void enqueueFailureCannotProduceASuccessResponseOrSuccessAudit() {
        doThrow(new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED")).when(emails)
                .enqueue(any(), anyString(), anyString(), anyString(), anyString());
        assertThrows(IllegalStateException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        verifyNoInteractions(audits, passwords, jwt);
    }

    @Test
    void missingIdentityAndSpoofedAdminIdsAreRejectedBeforeAnyLookup() {
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 999L, 7L, http));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 999L, http));
        assertThrows(SecurityException.class, () -> service.revokeInvitation(90L, 999L, http));
        TenantContext.clear();
        TenantContext.setCompanyId(7L);
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(SecurityException.class, () -> service.getPendingInvitations(7L));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(SecurityException.class, () -> service.revokeInvitation(90L, 44L, http));
        verifyNoInteractions(invitations, users, companies, roles, emails, entityManager, subscriptions, audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {"AGENT", "TEAM_LEAD", "LIGHT_AGENT", "CUSTOMER"})
    void nonAdministratorsCannotManageInvitations(String roleType) {
        TenantContext.setContext(7L, 44L, roleType, actor.getEmail());
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(SecurityException.class, () -> service.getPendingInvitations(7L));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(SecurityException.class, () -> service.revokeInvitation(90L, 44L, http));
        verifyNoInteractions(invitations, companies, users, roles, emails, entityManager, subscriptions, audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {"disabled", "inactive-status", "changed-role", "changed-email", "foreign-company", "missing-user"})
    void currentDatabaseActorMustStillMatchTheAuthenticatedAdmin(String state) {
        switch (state) {
            case "disabled" -> actor.setIsActive(false);
            case "inactive-status" -> actor.setStatus("INACTIVE");
            case "changed-role" -> actor.getRole().setRoleType(Role.RoleType.AGENT);
            case "changed-email" -> actor.setEmail("changed@example.invalid");
            case "foreign-company" -> actor.setCompany(company(8L));
            case "missing-user" -> when(users.findById(44L)).thenReturn(Optional.empty());
            default -> fail("Unknown fixture");
        }
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(SecurityException.class, () -> service.getPendingInvitations(7L));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(SecurityException.class, () -> service.revokeInvitation(90L, 44L, http));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verifyNoInteractions(emails, passwords, jwt, audits);
    }

    @Test
    void anotherTenantsInvitationCannotBeReadResentOrRevoked() {
        when(invitations.findCompanyIdByInvitationId(90L)).thenReturn(Optional.of(8L));
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 8L, http));
        assertThrows(SecurityException.class, () -> service.getPendingInvitations(8L));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(SecurityException.class, () -> service.revokeInvitation(90L, 44L, http));
        verify(invitations, never()).findForUpdateByIdAndCompanyId(anyLong(), anyLong());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verifyNoInteractions(companies, emails, passwords, jwt, audits);
    }

    @ParameterizedTest
    @ValueSource(strings = {"SUPER_ADMIN", "CUSTOMER", "foreign-role", "foreign-system-role", "unowned-global-role", "missing-role"})
    void roleIdsCannotGrantGlobalPrivilegeOrEscapeTheTargetTenant(String state) {
        switch (state) {
            case "SUPER_ADMIN" -> role.setRoleType(Role.RoleType.SUPER_ADMIN);
            case "CUSTOMER" -> role.setRoleType(Role.RoleType.CUSTOMER);
            case "foreign-role" -> role.setCompany(company(8L));
            case "foreign-system-role" -> {
                role.setCompany(company(8L));
                role.setIsSystemRole(true);
            }
            case "unowned-global-role" -> role.setCompany(null);
            case "missing-role" -> when(roles.findById(2L)).thenReturn(Optional.empty());
            default -> fail("Unknown fixture");
        }
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(SecurityException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(SecurityException.class, () -> service.acceptInvitation(accept(), http));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(passwords, jwt, audits);
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
    }

    @ParameterizedTest
    @EnumSource(value = Role.RoleType.class, names = {"COMPANY_ADMIN", "TEAM_LEAD", "AGENT", "LIGHT_AGENT"})
    void allowedTenantStaffRolesCanBeInvited(Role.RoleType type) {
        role.setRoleType(type);
        assertEquals(true, service.inviteAgent(invite(), 44L, 7L, http).get("success"));
        verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), anyString(), anyString());
    }

    @Test
    void defaultAgentRoleCanUseOnlyATenantRoleOrATrulyGlobalSystemRole() {
        InviteAgentRequest request = invite();
        request.setRoleId(null);
        when(roles.findByCompanyIdAndRoleType(7L, Role.RoleType.AGENT)).thenReturn(Optional.empty());
        Role foreignSystem = role(4L, Role.RoleType.AGENT, company(8L));
        foreignSystem.setIsSystemRole(true);
        Role global = role(5L, Role.RoleType.AGENT, null);
        global.setIsSystemRole(true);
        when(roles.findByCompanyIdOrIsSystemRoleTrue(7L)).thenReturn(List.of(foreignSystem, global));
        assertEquals(true, service.inviteAgent(request, 44L, 7L, http).get("success"));
        ArgumentCaptor<AgentInvitation> saved = ArgumentCaptor.forClass(AgentInvitation.class);
        verify(invitations).save(saved.capture());
        assertEquals(5L, saved.getValue().getRoleId());
        verify(roles, never()).findFirstByRoleType(any());
    }

    @Test
    void superAdminMayTargetAnotherCompanyButStillCannotAssignItsForeignRoles() {
        Company target = company(8L);
        when(companies.findById(8L)).thenReturn(Optional.of(target));
        actor.setRole(role(1L, Role.RoleType.SUPER_ADMIN, null));
        actor.getRole().setIsSystemRole(true);
        TenantContext.setContext(8L, 44L, "SUPER_ADMIN", actor.getEmail());
        assertThrows(SecurityException.class, () -> service.inviteAgent(invite(), 44L, 8L, http));
        role.setCompany(null);
        role.setIsSystemRole(true);
        assertEquals(true, service.inviteAgent(invite(), 44L, 8L, http).get("success"));
        verify(emails).enqueue(eq(8L), eq(EMAIL), anyString(), anyString(), anyString());
        verify(audits).recordEvent(eq(8L), eq(44L), eq("INVITATION_QUEUED"), eq(EMAIL), anyString(), same(http));
    }

    @ParameterizedTest
    @CsvSource({"2,5,2,0", "5,2,2,0", "5,5,3,2", "0,5,0,0"})
    void actualCompanyAndSubscriptionLimitsIncludeOtherUnexpiredInvitations(int companyLimit, int subscriptionLimit,
                                                                          long active, long pending) {
        company.setPlanName("ENTERPRISE");
        company.setMaxAgents(companyLimit);
        subscription.setAgentLimit(subscriptionLimit);
        when(users.countByCompanyIdAndIsActiveTrue(7L)).thenReturn(active);
        when(invitations.countLiveInvitationsExcludingEmail(eq(7L), eq(AgentInvitation.InvitationStatus.PENDING),
                any(LocalDateTime.class), eq(EMAIL))).thenReturn(pending);
        assertThrows(IllegalStateException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http));
        verify(entityManager, times(3)).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(users, never()).save(any(User.class));
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(passwords, jwt, audits);
    }

    @Test
    void replacementOfTheSameInviteDoesNotConsumeASecondSeatAndInvalidatesOlderRequests() {
        company.setMaxAgents(2);
        subscription.setAgentLimit(2);
        when(users.countByCompanyIdAndIsActiveTrue(7L)).thenReturn(1L);
        AgentInvitation expired = invitation(91L, AgentInvitation.InvitationStatus.EXPIRED);
        expired.setExpiresAt(LocalDateTime.now().minusDays(1));
        when(invitations.findByCompanyIdAndEmailIgnoreCaseAndStatusIn(eq(7L), eq(EMAIL), anyCollection()))
                .thenReturn(List.of(invitation, expired));
        assertEquals(true, service.inviteAgent(invite(), 44L, 7L, http).get("success"));
        assertEquals(AgentInvitation.InvitationStatus.REVOKED, invitation.getStatus());
        assertEquals(AgentInvitation.InvitationStatus.REVOKED, expired.getStatus());
        verify(invitations).countLiveInvitationsExcludingEmail(eq(7L), eq(AgentInvitation.InvitationStatus.PENDING),
                any(LocalDateTime.class), eq(EMAIL));
        verify(invitations).findByCompanyIdAndEmailIgnoreCaseAndStatusIn(7L, EMAIL,
                List.of(AgentInvitation.InvitationStatus.PENDING, AgentInvitation.InvitationStatus.EXPIRED));
    }

    @ParameterizedTest
    @ValueSource(strings = {"suspended-company", "inactive-company", "locked", "cancelled", "expired-subscription",
            "expired-grace", "future-subscription", "missing-limit", "negative-limit", "missing-status"})
    void inactiveWorkspacesAndUnusableSubscriptionStateCannotAddStaff(String state) {
        switch (state) {
            case "suspended-company" -> company.setStatus(Company.CompanyStatus.SUSPENDED);
            case "inactive-company" -> company.setStatus(Company.CompanyStatus.INACTIVE);
            case "locked" -> subscription.setStatus(CompanySubscription.SubscriptionStatus.LOCKED);
            case "cancelled" -> subscription.setStatus(CompanySubscription.SubscriptionStatus.CANCELLED);
            case "expired-subscription" -> subscription.setCurrentPeriodEnd(LocalDateTime.now().minusSeconds(1));
            case "expired-grace" -> {
                subscription.setStatus(CompanySubscription.SubscriptionStatus.PAST_DUE);
                subscription.setCurrentPeriodEnd(LocalDateTime.now().minusDays(10));
                subscription.setGracePeriodEndsAt(LocalDateTime.now().minusSeconds(1));
            }
            case "future-subscription" -> subscription.setCurrentPeriodStart(LocalDateTime.now().plusDays(1));
            case "missing-limit" -> subscription.setAgentLimit(null);
            case "negative-limit" -> subscription.setAgentLimit(-1);
            case "missing-status" -> subscription.setStatus(null);
            default -> fail("Unknown fixture");
        }
        assertThrows(IllegalStateException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(passwords, jwt, audits);
    }

    @Test
    void aTrialOrExplicitUnexpiredGracePeriodUsesTheStoredSeatLimit() {
        company.setStatus(Company.CompanyStatus.TRIAL);
        company.setMaxAgents(null);
        subscription.setStatus(CompanySubscription.SubscriptionStatus.PAST_DUE);
        subscription.setCurrentPeriodEnd(LocalDateTime.now().minusDays(2));
        subscription.setGracePeriodEndsAt(LocalDateTime.now().plusDays(1));
        subscription.setAgentLimit(1);
        assertEquals(true, service.inviteAgent(invite(), 44L, 7L, http).get("success"));
    }

    @ParameterizedTest
    @EnumSource(value = AgentInvitation.InvitationStatus.class, names = {"ACCEPTED", "REVOKED"})
    void acceptedOrRevokedInvitationsCannotBeResurrectedEvenWhenExpired(AgentInvitation.InvitationStatus status) {
        invitation.setStatus(status);
        invitation.setExpiresAt(LocalDateTime.now().minusDays(1));
        String previousHash = invitation.getTokenHash();
        LocalDateTime previousExpiry = invitation.getExpiresAt();
        assertThrows(IllegalArgumentException.class, () -> service.resendInvitation(90L, 44L, http));
        assertEquals(status, invitation.getStatus());
        assertEquals(previousHash, invitation.getTokenHash());
        assertEquals(previousExpiry, invitation.getExpiresAt());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(audits, passwords, jwt);
    }

    @ParameterizedTest
    @ValueSource(strings = {"pending", "pending-but-expired", "expired"})
    void resendingUnusedInvitationsQueuesANewTokenAndInvalidatesTheOldOne(String state) {
        if (!state.equals("pending")) invitation.setExpiresAt(LocalDateTime.now().minusDays(1));
        if (state.equals("expired")) invitation.setStatus(AgentInvitation.InvitationStatus.EXPIRED);
        invitation.setInvitedByUserId(45L);
        Map<String, Object> result = service.resendInvitation(90L, 44L, http);
        ArgumentCaptor<String> html = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> key = ArgumentCaptor.forClass(String.class);
        verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), html.capture(), key.capture());
        String raw = extractToken(html.getValue());
        assertNotEquals(RAW_TOKEN, raw);
        assertEquals(hash(raw), invitation.getTokenHash());
        assertEquals(AgentInvitation.InvitationStatus.PENDING, invitation.getStatus());
        assertEquals("Invited Person", invitation.getName());
        assertEquals(EMAIL, invitation.getEmail());
        assertEquals(2L, invitation.getRoleId());
        assertTrue(invitation.getExpiresAt().isAfter(LocalDateTime.now().plusDays(6)));
        assertTrue(key.getValue().matches("agent-invitation:90:resend:[0-9a-f-]{36}"));
        assertFalse(key.getValue().contains(raw));
        assertFalse(key.getValue().contains(invitation.getTokenHash()));
        assertEquals(Set.of("success", "message", "invitationId"), result.keySet());
        assertFalse(result.toString().contains(raw));
        verify(audits).recordEvent(eq(7L), eq(44L), eq("INVITATION_RESEND_QUEUED"), eq(EMAIL), anyString(), same(http));
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(accept(), http));
        verifyNoInteractions(passwords, jwt);
        verify(invitations, never()).findById(anyLong());
    }

    @Test
    void revocationLocksTheTenantInvitationAndAuditsTheCurrentActor() {
        invitation.setInvitedByUserId(45L);
        assertEquals(true, service.revokeInvitation(90L, 44L, http).get("success"));
        assertEquals(AgentInvitation.InvitationStatus.REVOKED, invitation.getStatus());
        var order = inOrder(entityManager, invitations);
        order.verify(entityManager).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        order.verify(invitations).findForUpdateByIdAndCompanyId(90L, 7L);
        order.verify(invitations).save(invitation);
        verify(audits).recordEvent(eq(7L), eq(44L), eq("INVITATION_REVOKED"), eq(EMAIL), anyString(), same(http));
        verifyNoInteractions(emails, passwords, jwt);
    }

    @Test
    void publicAcceptanceCreatesOnlyTheInvitedIdentityAndIssuesAnActualStaffJwt() {
        TenantContext.clear();
        JwtTokenProvider provider = new JwtTokenProvider();
        ReflectionTestUtils.setField(provider, "jwtExpirationMs", 60_000L);
        LoginResponse result = newService(provider).acceptInvitation(accept(), http);
        assertTrue(provider.validateToken(result.getToken()));
        var claims = provider.getClaimsFromToken(result.getToken());
        assertEquals(EMAIL, claims.getSubject());
        assertEquals("STAFF", claims.get("type"));
        assertEquals("AGENT", claims.get("role"));
        assertEquals(7L, ((Number) claims.get("companyId")).longValue());
        assertEquals(55L, ((Number) claims.get("userId")).longValue());
        assertEquals(0L, ((Number) claims.get("authVersion")).longValue());
        assertNotEquals(RAW_TOKEN, result.getToken());
        assertEquals("Invited Person", result.getDisplayName());
        assertEquals("Invited", result.getFirstName());
        assertEquals("Person", result.getLastName());
        assertEquals(EMAIL, result.getEmail());
        assertEquals(7L, result.getCompany().getId());
        ArgumentCaptor<User> saved = ArgumentCaptor.forClass(User.class);
        verify(users).save(saved.capture());
        assertEquals("encoded-invited-password", saved.getValue().getPasswordHash());
        assertEquals(role, saved.getValue().getRole());
        assertTrue(saved.getValue().getIsActive());
        assertEquals("ACTIVE", saved.getValue().getStatus());
        assertEquals(AgentInvitation.InvitationStatus.ACCEPTED, invitation.getStatus());
        verify(passwords).encode(PASSPHRASE);
        verify(audits).recordEvent(eq(7L), eq(55L), eq("INVITATION_ACCEPTED"), eq(EMAIL), anyString(), same(http));
        verifyNoInteractions(emails);
    }

    @ParameterizedTest
    @ValueSource(strings = {"INACTIVE", "INVITED", "PENDING"})
    void intendedInactiveAccountsAreActivatedWithEncodedCredentialsAndVersionRevocation(String status) {
        User existing = inactiveInvitee();
        existing.setStatus(status);
        when(users.findForAuthenticationByCompanyAndEmail(7L, EMAIL)).thenReturn(Optional.of(existing));
        assertEquals("provider-issued-staff-token", service.acceptInvitation(accept(), http).getToken());
        assertEquals(9L, existing.getAuthVersion());
        assertEquals("encoded-invited-password", existing.getPasswordHash());
        assertTrue(existing.getIsActive());
        assertEquals("ACTIVE", existing.getStatus());
        assertEquals("Invited Person", existing.getDisplayName());
        assertEquals(EMAIL, existing.getEmail());
        assertSame(role, existing.getRole());
        var order = inOrder(entityManager, invitations, users, passwords, jwt);
        order.verify(entityManager).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        order.verify(invitations).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        order.verify(users).findForAuthenticationByCompanyAndEmail(7L, EMAIL);
        order.verify(passwords).encode(PASSPHRASE);
        order.verify(users).save(existing);
        order.verify(invitations).save(invitation);
        order.verify(jwt).generateToken(existing);
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(accept(), http));
        assertEquals(9L, existing.getAuthVersion());
        verify(passwords, times(1)).encode(PASSPHRASE);
    }

    @ParameterizedTest
    @CsvSource({"true,ACTIVE", "false,ACTIVE", "true,INACTIVE", "false,SUSPENDED", "false,DELETED"})
    void activeOrUnavailableAccountsCannotBeTakenOverByInviteOrAcceptance(boolean active, String status) {
        User existing = inactiveInvitee();
        existing.setIsActive(active);
        existing.setStatus(status);
        when(users.findForAuthenticationByCompanyAndEmail(7L, EMAIL)).thenReturn(Optional.of(existing));
        assertThrows(IllegalStateException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http));
        assertEquals("previous-encoded-password", existing.getPasswordHash());
        assertEquals("Previous Name", existing.getDisplayName());
        assertEquals(8L, existing.getAuthVersion());
        assertEquals(active, existing.getIsActive());
        assertEquals(status, existing.getStatus());
        assertSame(role, existing.getRole());
        assertEquals(AgentInvitation.InvitationStatus.PENDING, invitation.getStatus());
        verify(users, never()).save(any(User.class));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verifyNoInteractions(passwords, jwt, audits);
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void anEmailInvitationCannotBypassAnExistingSecondFactor() {
        User existing = inactiveInvitee();
        existing.setIsTwoFactorEnabled(true);
        when(users.findForAuthenticationByCompanyAndEmail(7L, EMAIL)).thenReturn(Optional.of(existing));
        assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http));
        assertThrows(IllegalStateException.class, () -> service.resendInvitation(90L, 44L, http));
        assertEquals("previous-encoded-password", existing.getPasswordHash());
        assertEquals(8L, existing.getAuthVersion());
        assertTrue(existing.getIsTwoFactorEnabled());
        verifyNoInteractions(passwords, jwt, audits);
        verify(users, never()).save(any(User.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"foreign-company", "other-email", "customer", "super-admin"})
    void anExistingAccountMustBeTheSameEligibleTenantIdentity(String state) {
        User existing = inactiveInvitee();
        switch (state) {
            case "foreign-company" -> existing.setCompany(company(8L));
            case "other-email" -> existing.setEmail("other@example.invalid");
            case "customer" -> existing.setRole(role(6L, Role.RoleType.CUSTOMER, company));
            case "super-admin" -> existing.setRole(role(1L, Role.RoleType.SUPER_ADMIN, null));
            default -> fail("Unknown fixture");
        }
        when(users.findForAuthenticationByCompanyAndEmail(7L, EMAIL)).thenReturn(Optional.of(existing));
        assertThrows(SecurityException.class, () -> service.acceptInvitation(accept(), http));
        assertEquals("previous-encoded-password", existing.getPasswordHash());
        assertEquals(8L, existing.getAuthVersion());
        verifyNoInteractions(passwords, jwt, audits);
        verify(users, never()).save(any(User.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"accepted", "revoked", "expired", "missing-status", "missing-expiry", "wrong-company", "rotated-token", "missing-role"})
    void acceptanceRechecksEveryLockedInvitationFieldBeforeChangingCredentials(String state) {
        switch (state) {
            case "accepted" -> invitation.setStatus(AgentInvitation.InvitationStatus.ACCEPTED);
            case "revoked" -> invitation.setStatus(AgentInvitation.InvitationStatus.REVOKED);
            case "expired" -> invitation.setExpiresAt(LocalDateTime.now().minusNanos(1));
            case "missing-status" -> invitation.setStatus(null);
            case "missing-expiry" -> invitation.setExpiresAt(null);
            case "wrong-company" -> invitation.setCompanyId(8L);
            case "rotated-token" -> invitation.setTokenHash(hash("a replacement token"));
            case "missing-role" -> invitation.setRoleId(null);
            default -> fail("Unknown fixture");
        }
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(accept(), http));
        verify(invitations).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(passwords, jwt, emails, audits);
    }

    @Test
    void revocationWhileWaitingForTheCompanyLockCannotBeOverwrittenByAcceptance() {
        doAnswer(call -> {
            invitation.setStatus(AgentInvitation.InvitationStatus.REVOKED);
            return null;
        }).when(entityManager).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(accept(), http));
        verify(invitations, never()).findByTokenHash(anyString());
        verify(invitations).findForConsumptionByTokenHash(hash(RAW_TOKEN));
        verifyNoInteractions(passwords, jwt, emails, audits);
    }

    @Test
    void aFailedCompanyLockCannotLeadToAnUnlockedWrite() {
        doThrow(new PessimisticLockException("synthetic lock failure")).when(entityManager)
                .refresh(company, LockModeType.PESSIMISTIC_WRITE);
        assertThrows(PessimisticLockException.class, () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertThrows(PessimisticLockException.class, () -> service.resendInvitation(90L, 44L, http));
        assertThrows(PessimisticLockException.class, () -> service.acceptInvitation(accept(), http));
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(passwords, jwt, audits);
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void publicValidationAndAdministrativeDtosNeverExposeTokenHashesOrRawLinks() throws Exception {
        var validation = service.validateInvitation(RAW_TOKEN);
        assertTrue(validation.isValid());
        assertEquals(EMAIL, validation.getEmail());
        assertEquals("Invited Person", validation.getName());
        when(invitations.findByCompanyIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(invitation));
        var listed = service.getPendingInvitations(7L);
        assertEquals(1, listed.size());
        var json = new com.fasterxml.jackson.databind.ObjectMapper()
                .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule());
        String payload = json.writeValueAsString(validation) + json.writeValueAsString(listed);
        assertFalse(payload.contains(RAW_TOKEN));
        assertFalse(payload.contains(invitation.getTokenHash()));
        assertFalse(payload.contains("inviteUrl"));
        verify(invitations, never()).findForConsumptionByTokenHash(anyString());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verifyNoInteractions(passwords, emails, jwt, audits);
    }

    @ParameterizedTest
    @EnumSource(value = AgentInvitation.InvitationStatus.class, names = {"ACCEPTED", "REVOKED", "EXPIRED"})
    void publicValidationDoesNotAcceptTerminalInvitations(AgentInvitation.InvitationStatus status) {
        invitation.setStatus(status);
        assertFalse(service.validateInvitation(RAW_TOKEN).isValid());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verifyNoInteractions(passwords, jwt, audits, emails);
    }

    @Test
    void longPassphrasesAreNotTruncatedAndTermsAreRequiredBeforeLookup() {
        AcceptInvitationRequest request = accept();
        request.setAgreedToTerms(false);
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(request, http));
        verifyNoInteractions(invitations, companies, users, passwords, jwt);
        request.setAgreedToTerms(true);
        request.setPassword("orchard ".repeat(128));
        assertEquals(1024, request.getPassword().length());
        service.acceptInvitation(request, http);
        verify(passwords).encode(request.getPassword());
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"short", " ", "<not-a-token>"})
    void malformedInvitationTokensNeverReachARepository(String raw) {
        AcceptInvitationRequest request = accept();
        request.setToken(raw);
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(request, http));
        assertFalse(service.validateInvitation(raw).isValid());
        verifyNoInteractions(invitations, companies, users, passwords, jwt, emails, audits);
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {"javascript:alert(1)", "/relative", "https://user@example.invalid", "https://example.invalid/#fragment",
            "https://example.invalid?other=1", "https://example.invalid/%0dheader"})
    void unsafeConfiguredFrontendUrlsCannotQueueInvitations(String url) {
        ReflectionTestUtils.setField(service, "frontendUrl", url);
        IllegalStateException error = assertThrows(IllegalStateException.class,
                () -> service.inviteAgent(invite(), 44L, 7L, http));
        assertEquals("ACCOUNT_EMAIL_NOT_READY", error.getMessage());
        assertNull(error.getCause());
        verify(invitations, never()).save(any(AgentInvitation.class));
        verify(emails, never()).enqueue(any(), anyString(), anyString(), anyString(), anyString());
        verifyNoInteractions(passwords, jwt, audits);
    }

    @Test
    void credentialEncodingAndJwtFailuresNeverFallBackToFakeAuthentication() {
        IllegalStateException encoderFailure = new IllegalStateException("synthetic encoder failure");
        when(passwords.encode(PASSPHRASE)).thenThrow(encoderFailure);
        assertSame(encoderFailure, assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http)));
        assertEquals(AgentInvitation.InvitationStatus.PENDING, invitation.getStatus());
        verify(users, never()).save(any(User.class));
        verifyNoInteractions(jwt, audits);
        doReturn("encoded-invited-password").when(passwords).encode(PASSPHRASE);
        when(jwt.generateToken(any(User.class))).thenReturn(null);
        IllegalStateException unavailable = assertThrows(IllegalStateException.class, () -> service.acceptInvitation(accept(), http));
        assertEquals("AUTHENTICATION_TOKEN_NOT_AVAILABLE", unavailable.getMessage());
        verify(jwt).generateToken(any(User.class));
        verifyNoInteractions(audits);
    }

    @Test
    void oversizedPasswordsAreRejectedBeforeInvitationLookup() {
        AcceptInvitationRequest request = accept();
        request.setPassword("x".repeat(1025));
        assertThrows(IllegalArgumentException.class, () -> service.acceptInvitation(request, http));
        verifyNoInteractions(invitations, companies, users, passwords, jwt, emails, audits);
    }

    private AgentInvitationService newService(JwtTokenProvider provider) {
        AgentInvitationService result = new AgentInvitationService(invitations, users, companies, roles, passwords,
                provider, audits, emails, entityManager, subscriptions);
        ReflectionTestUtils.setField(result, "frontendUrl", "https://desk.example.invalid/help&support/");
        return result;
    }

    private InviteAgentRequest invite() {
        InviteAgentRequest request = new InviteAgentRequest();
        request.setEmail(" INVITEE@EXAMPLE.INVALID ");
        request.setName("Invited Person");
        request.setRoleId(2L);
        return request;
    }

    private AcceptInvitationRequest accept() {
        AcceptInvitationRequest request = new AcceptInvitationRequest();
        request.setToken(RAW_TOKEN);
        request.setPassword(PASSPHRASE);
        request.setAgreedToTerms(true);
        request.setName("Client supplied different identity");
        return request;
    }

    private AgentInvitation invitation(Long id, AgentInvitation.InvitationStatus status) {
        AgentInvitation result = new AgentInvitation();
        result.setId(id);
        result.setCompanyId(7L);
        result.setInvitedByUserId(44L);
        result.setEmail(EMAIL);
        result.setName("Invited Person");
        result.setRoleId(2L);
        result.setTokenHash(hash(RAW_TOKEN));
        result.setStatus(status);
        result.setExpiresAt(LocalDateTime.now().plusDays(7));
        return result;
    }

    private User inactiveInvitee() {
        User existing = new User();
        existing.setId(55L);
        existing.setCompany(company);
        existing.setEmail(EMAIL);
        existing.setRole(role);
        existing.setDisplayName("Previous Name");
        existing.setIsActive(false);
        existing.setStatus("INACTIVE");
        existing.setAuthVersion(8L);
        existing.setPasswordHash("previous-encoded-password");
        return existing;
    }

    private static Company company(Long id) {
        Company result = new Company();
        result.setId(id);
        result.setCompanyCode("WORKSPACE" + id);
        result.setName("Workspace " + id);
        result.setSubdomain("workspace" + id);
        result.setMaxAgents(50);
        return result;
    }

    private static Role role(Long id, Role.RoleType type, Company company) {
        Role result = new Role();
        result.setId(id);
        result.setName(type.name());
        result.setRoleType(type);
        result.setCompany(company);
        return result;
    }

    private static String extractToken(String html) {
        Matcher matcher = Pattern.compile("token=([0-9a-f]{64})").matcher(html);
        assertTrue(matcher.find());
        return matcher.group(1);
    }

    private static String hash(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception unavailable) {
            throw new AssertionError(unavailable);
        }
    }
}
