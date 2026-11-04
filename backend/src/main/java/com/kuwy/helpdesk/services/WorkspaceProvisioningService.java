package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.util.HtmlSanitizer;
import com.kuwy.helpdesk.util.PasswordPolicy;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class WorkspaceProvisioningService {
    private static final Set<String> RESERVED = Set.of("admin", "adminconsole", "api", "app", "auth", "billing", "blog", "cdn", "dashboard", "dev", "docs", "help", "internal", "kuwy", "mail", "portal", "root", "smtp", "status", "superadmin", "support", "test", "web", "www", "secure", "login", "signup", "pricing", "reset-password", "accept-invitation");
    private final CompanyRepository companies;
    private final DepartmentRepository departments;
    private final RoleRepository roles;
    private final UserRepository users;
    private final CompanyMailboxRepository mailboxes;
    private final CompanySubscriptionRepository subscriptions;
    private final CannedResponseRepository canned;
    private final PlanCatalogService plans;
    private final SignupVerificationService verification;
    private final AccountEmailService emails;
    private final PasswordEncoder passwords;
    private final JwtTokenProvider tokens;
    private final SecurityAuditService audit;
    private final ObjectMapper json;
    private Clock clock = Clock.systemUTC();

    @Value("${kuwy.mail.inbound-domain:}")
    private String inboundDomain;

    public record Signup(String companyName, String subdomain, String adminName, String adminEmail,
                         @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String adminPassword,
                         String planTier, String challengeId,
                         @com.fasterxml.jackson.annotation.JsonProperty(access = com.fasterxml.jackson.annotation.JsonProperty.Access.WRITE_ONLY) String verificationCode,
                         Boolean agreedToTerms) {
        @Override public String toString() { return "Signup[credentials redacted]"; }
    }

    public Map<String, Object> availability(String rawSlug) {
        String slug;
        try { slug = validateSlug(rawSlug); }
        catch (IllegalArgumentException invalid) { return Map.of("available", false, "reason", invalid.getMessage()); }
        return companies.findBySubdomain(slug).isPresent()
                ? Map.of("available", false, "reason", "This workspace address is not available.")
                : Map.of("available", true, "slug", slug);
    }

    @Transactional(noRollbackFor = AuthenticationException.class)
    public LoginResponse provision(Signup request, HttpServletRequest httpRequest) {
        if (request == null || !Boolean.TRUE.equals(request.agreedToTerms())) throw new IllegalArgumentException("Accept the Terms and Privacy Policy before creating a workspace.");
        String slug = validateSlug(request.subdomain());
        String name = text(request.companyName(), 150, "Company name");
        String adminName = text(request.adminName(), 100, "Your name");
        String email = CustomerOtpService.canonicalEmail(request.adminEmail());
        PasswordPolicy.validate(request.adminPassword());
        var plan = plans.requirePublicPlan(request.planTier() == null ? "STARTER" : request.planTier());
        emails.requireReady();
        if (companies.findBySubdomain(slug).isPresent()) throw new IllegalArgumentException("This workspace address is not available.");
        verification.consume(request.challengeId(), email, request.verificationCode(), httpRequest);

        Company company = new Company();
        company.setName(name); company.setSubdomain(slug);
        company.setCompanyCode(slug.substring(0, Math.min(8, slug.length())).toUpperCase(Locale.ROOT) + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT));
        company.setStatus(plan.baseTier() == PlanDefinition.BaseTier.FREE ? Company.CompanyStatus.ACTIVE : Company.CompanyStatus.TRIAL);
        company.setPlanName(plan.code()); company.setMaxAgents(plan.includedAgents()); company.setPrimaryColor("#2563eb");
        try {
            company.setSettingsJson(json.writeValueAsString(Map.of(
                    "branding", Map.of("name", name, "supportEmail", email, "portalName", name + " Support", "timezone", "UTC", "defaultLanguage", "en"),
                    "security", Map.of("twoFactorPolicy", "REQUIRED_ADMINS", "sessionTimeoutMinutes", 30),
                    "onboarding", Map.of("connectEmail", false, "inviteAgent", false, "createTicket", false))));
        } catch (com.fasterxml.jackson.core.JsonProcessingException invalid) { throw new IllegalStateException("Workspace defaults could not be prepared."); }
        companies.saveAndFlush(company);

        Department department = new Department(); department.setCompany(company); department.setName("Customer support"); department.setCode("SUPPORT"); department.setDescription("General customer support"); departments.save(department);
        Role adminRole = null;
        for (Role.RoleType type : List.of(Role.RoleType.COMPANY_ADMIN, Role.RoleType.AGENT, Role.RoleType.TEAM_LEAD, Role.RoleType.LIGHT_AGENT)) {
            Role role = new Role(); role.setCompany(company); role.setRoleType(type);
            role.setName(type.name().toLowerCase(Locale.ROOT).replace('_', ' ')); role.setIsSystemRole(false);
            roles.save(role); if (type == Role.RoleType.COMPANY_ADMIN) adminRole = role;
        }
        User admin = new User(); admin.setCompany(company); admin.setRole(adminRole); admin.setFirstName(adminName); admin.setLastName("");
        admin.setDisplayName(adminName); admin.setEmail(email); admin.setPasswordHash(passwords.encode(request.adminPassword())); admin.setStatus("ACTIVE"); admin.setIsActive(true);
        users.saveAndFlush(admin);

        CompanySubscription subscription = new CompanySubscription(); subscription.setCompany(company);
        subscription.setPlanTier(CompanySubscription.PlanTier.valueOf(plan.baseTier().name())); subscription.setAmount(BigDecimal.ZERO);
        subscription.setStatus(plan.baseTier() == PlanDefinition.BaseTier.FREE ? CompanySubscription.SubscriptionStatus.ACTIVE : CompanySubscription.SubscriptionStatus.TRIAL);
        subscription.setAgentLimit(plan.includedAgents()); subscription.setTicketLimitMonthly(plan.ticketLimitMonthly()); subscription.setCurrency("INR");
        subscription.setCurrentPeriodStart(LocalDateTime.now(clock)); subscription.setCurrentPeriodEnd(LocalDateTime.now(clock).plusDays(Math.max(1, plan.trialDays())));
        subscriptions.save(subscription);

        if (inboundDomain != null && inboundDomain.matches("(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,63}")) {
            CompanyMailbox mailbox = new CompanyMailbox(); mailbox.setCompany(company); mailbox.setDepartment(department);
            mailbox.setMailboxName("Support inbox setup"); mailbox.setEmailAddress(email);
            mailbox.setForwardingAddress(UUID.randomUUID().toString().replace("-", "") + "@" + inboundDomain.toLowerCase(Locale.ROOT));
            mailbox.setForwardingVerified(false); mailbox.setProviderType(CompanyMailbox.MailProviderType.FORWARDING);
            mailbox.setAuthType(CompanyMailbox.AuthType.FORWARD_ONLY); mailbox.setSyncStatus(CompanyMailbox.SyncStatus.PAUSED); mailbox.setIsActive(false);
            mailbox.setSendAsName(name + " Support"); mailbox.setReplyToAddress(email); mailboxes.save(mailbox);
        }
        CannedResponse response = new CannedResponse(); response.setCompany(company); response.setTitle("Acknowledgement"); response.setShortcut("thanks");
        response.setContent("Hi {{customer.name}},\n\nThank you for contacting {{company.name}}. We are reviewing your request.\n\n{{agent.name}}"); response.setIsShared(true); canned.save(response);
        audit.recordEvent(company.getId(), admin.getId(), "WORKSPACE_CREATED", email, "Verified signup; terms/privacy version 2026-11-04 accepted; plan revision " + plan.revision(), httpRequest);
        emails.enqueue(company.getId(), email, "Your workspace is ready", "<p>Your workspace is ready. Sign in to set up an authenticator, connect your support email, and invite your team.</p>", "workspace-welcome:" + company.getId());
        return LoginResponse.builder().token(tokens.generateToken(admin)).userId(admin.getId()).email(email).firstName(adminName).lastName("")
                .displayName(adminName).roleType("COMPANY_ADMIN").roleName("Company admin").mfaSetupRequired(true)
                .company(LoginResponse.CompanyInfo.builder().id(company.getId()).companyCode(company.getCompanyCode()).name(name)
                        .subdomain(slug).status(company.getStatus().name()).primaryColor(company.getPrimaryColor()).planName(plan.code()).build()).build();
    }

    private String validateSlug(String value) {
        String slug = value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
        if (!slug.matches("[a-z0-9][a-z0-9-]{1,28}[a-z0-9]") || slug.startsWith("xn--") || RESERVED.contains(slug)) {
            throw new IllegalArgumentException("Use an available address with 3-30 letters, numbers, or hyphens, starting and ending with a letter or number.");
        }
        return slug;
    }

    private String text(String value, int max, String label) {
        if (value == null || value.length() > max || value.codePoints().anyMatch(Character::isISOControl)) throw new IllegalArgumentException(label + " is invalid.");
        String clean = HtmlSanitizer.cleanToPlainText(value).strip();
        if (clean.isBlank()) throw new IllegalArgumentException(label + " is required.");
        return clean;
    }
}
