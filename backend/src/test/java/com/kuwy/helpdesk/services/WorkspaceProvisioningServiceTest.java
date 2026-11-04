package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.PublicPlan;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class WorkspaceProvisioningServiceTest {
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final DepartmentRepository departments = mock(DepartmentRepository.class);
    private final RoleRepository roles = mock(RoleRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final CompanyMailboxRepository mailboxes = mock(CompanyMailboxRepository.class);
    private final CompanySubscriptionRepository subscriptions = mock(CompanySubscriptionRepository.class);
    private final CannedResponseRepository canned = mock(CannedResponseRepository.class);
    private final PlanCatalogService plans = mock(PlanCatalogService.class);
    private final SignupVerificationService verification = mock(SignupVerificationService.class);
    private final AccountEmailService emails = mock(AccountEmailService.class);
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder(4);
    private final JwtTokenProvider tokens = mock(JwtTokenProvider.class);
    private final SecurityAuditService audit = mock(SecurityAuditService.class);
    private final WorkspaceProvisioningService service = new WorkspaceProvisioningService(companies, departments, roles, users, mailboxes, subscriptions, canned, plans, verification, emails, passwords, tokens, audit, new ObjectMapper());
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @BeforeEach
    void setup() {
        ReflectionTestUtils.setField(service, "clock", Clock.fixed(Instant.parse("2026-11-04T09:00:00Z"), ZoneOffset.UTC));
        ReflectionTestUtils.setField(service, "inboundDomain", "");
        when(companies.findBySubdomain(anyString())).thenReturn(Optional.empty());
        when(companies.saveAndFlush(any())).thenAnswer(call -> { Company company = call.getArgument(0); company.setId(7L); return company; });
        when(users.saveAndFlush(any())).thenAnswer(call -> { User user = call.getArgument(0); user.setId(11L); return user; });
        when(plans.requirePublicPlan("PRO")).thenReturn(new PublicPlan("PRO", "Professional", "Support teams", PlanDefinition.BaseTier.PRO,
                PlanDefinition.Status.PUBLIC, "INR", true, new BigDecimal("5999.00"), new BigDecimal("57590.40"), 25, 10000, 14, 0, Map.of(), 3));
        when(tokens.generateToken(any())).thenReturn("synthetic-authenticated-token");
    }

    @Test
    void verifiedSignupCreatesScopedDefaultsAndABoundedTrialNotAPaidPlan() {
        var response = service.provision(valid(), request);
        verify(verification).consume("synthetic-challenge", "owner@example.invalid", "234567", request);
        ArgumentCaptor<User> user = ArgumentCaptor.forClass(User.class);
        verify(users).saveAndFlush(user.capture());
        assertEquals(Role.RoleType.COMPANY_ADMIN, user.getValue().getRole().getRoleType());
        assertEquals(user.getValue().getCompany(), user.getValue().getRole().getCompany());
        assertTrue(passwords.matches("a unique synthetic passphrase", user.getValue().getPasswordHash()));
        ArgumentCaptor<CompanySubscription> sub = ArgumentCaptor.forClass(CompanySubscription.class);
        verify(subscriptions).save(sub.capture());
        assertEquals(CompanySubscription.SubscriptionStatus.TRIAL, sub.getValue().getStatus());
        assertEquals(BigDecimal.ZERO, sub.getValue().getAmount());
        assertEquals(LocalDateTime.of(2026, 11, 18, 9, 0), sub.getValue().getCurrentPeriodEnd());
        assertEquals(25, sub.getValue().getAgentLimit());
        assertEquals(10000, sub.getValue().getTicketLimitMonthly());
        verify(roles, times(4)).save(any());
        verifyNoInteractions(mailboxes);
        assertTrue(response.getMfaSetupRequired());
        assertEquals("PRO", response.getCompany().getPlanName());
        verify(emails).enqueue(eq(7L), eq("owner@example.invalid"), anyString(), anyString(), eq("workspace-welcome:7"));
    }

    @Test
    void missingConsentInvalidPasswordsAndReservedAddressesCannotCreateAccounts() {
        var input = valid();
        var noConsent = new WorkspaceProvisioningService.Signup(input.companyName(), input.subdomain(), input.adminName(), input.adminEmail(), input.adminPassword(), input.planTier(), input.challengeId(), input.verificationCode(), false);
        assertThrows(IllegalArgumentException.class, () -> service.provision(noConsent, request));
        assertEquals(false, service.availability("admin").get("available"));
        assertEquals(false, service.availability("bad/slash").get("available"));
        assertEquals(false, service.availability("-bad").get("available"));
        assertEquals(false, service.availability("xn--lookalike").get("available"));
        verify(companies, never()).saveAndFlush(any());
        verifyNoInteractions(users, roles, verification);
    }

    @Test
    void rejectedEmailProofPrecedesEveryWorkspaceWrite() {
        doThrow(new BadCredentialsException("Invalid verification")).when(verification).consume(any(), any(), any(), any());
        assertThrows(BadCredentialsException.class, () -> service.provision(valid(), request));
        verify(companies, never()).saveAndFlush(any());
        verifyNoInteractions(users, roles, departments, subscriptions, mailboxes, canned);
    }

    @Test
    void forwardingConfigurationDoesNotPretendMailboxVerificationOrConnection() {
        ReflectionTestUtils.setField(service, "inboundDomain", "in.example.invalid");
        service.provision(valid(), request);
        ArgumentCaptor<CompanyMailbox> box = ArgumentCaptor.forClass(CompanyMailbox.class);
        verify(mailboxes).save(box.capture());
        assertFalse(box.getValue().getForwardingVerified());
        assertFalse(box.getValue().getIsActive());
        assertEquals(CompanyMailbox.SyncStatus.PAUSED, box.getValue().getSyncStatus());
        assertEquals("owner@example.invalid", box.getValue().getEmailAddress());
        assertTrue(box.getValue().getForwardingAddress().matches("[a-f0-9]{32}@in\\.example\\.invalid"));
    }

    private WorkspaceProvisioningService.Signup valid() {
        return new WorkspaceProvisioningService.Signup("Synthetic Company", "synthetic-company", "Synthetic Owner", "owner@example.invalid", "a unique synthetic passphrase", "PRO", "synthetic-challenge", "234567", true);
    }
}
