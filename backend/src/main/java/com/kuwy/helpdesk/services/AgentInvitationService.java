package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.*;
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
import com.kuwy.helpdesk.util.PasswordPolicy;
import jakarta.mail.internet.InternetAddress;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.HtmlUtils;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class AgentInvitationService {

    private final AgentInvitationRepository invitationRepository;
    private final UserRepository userRepository;
    private final CompanyRepository companyRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;
    private final SecurityAuditService auditService;
    private final AccountEmailService accountEmailService;
    private final EntityManager entityManager;
    private final CompanySubscriptionRepository subscriptionRepository;

    @Value("${kuwy.frontend-url:http://localhost:5174}")
    private String frontendUrl;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Set<Role.RoleType> STAFF_ROLES = EnumSet.of(Role.RoleType.COMPANY_ADMIN,
            Role.RoleType.TEAM_LEAD, Role.RoleType.AGENT, Role.RoleType.LIGHT_AGENT);
    private static final List<AgentInvitation.InvitationStatus> UNUSED_STATUSES = List.of(
            AgentInvitation.InvitationStatus.PENDING, AgentInvitation.InvitationStatus.EXPIRED);
    private static final String INVALID_INVITATION = "This invitation is invalid, already used, revoked, or expired.";

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> inviteAgent(InviteAgentRequest req, Long invitingUserId, Long companyId, HttpServletRequest request) {
        User actor = requireAdmin(companyId, invitingUserId);
        accountEmailService.requireReady();
        String baseUrl = frontendBaseUrl();
        String email = req != null && req.getEmail() != null ? req.getEmail().trim().toLowerCase(Locale.ROOT) : "";
        String name = req != null && req.getName() != null ? req.getName().trim() : "";
        validateIdentity(email, name);

        Company company = lockCompany(companyId);
        requireActiveCompany(company);
        Role role = resolveRole(req.getRoleId(), companyId);
        userRepository.findForAuthenticationByCompanyAndEmail(companyId, email)
                .ifPresent(user -> requireInvitableAccount(user, companyId, email));
        assertSeatAvailable(company, email);
        revokeOtherInvitations(companyId, email, null);

        String rawToken = generateRandomHex(32);
        AgentInvitation invitation = new AgentInvitation();
        invitation.setCompanyId(company.getId());
        invitation.setInvitedByUserId(actor.getId());
        invitation.setEmail(email);
        invitation.setName(name);
        invitation.setRoleId(role.getId());
        invitation.setTokenHash(sha256(rawToken));
        invitation.setStatus(AgentInvitation.InvitationStatus.PENDING);
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));

        AgentInvitation saved = invitationRepository.save(invitation);
        queueInvitation(saved, company, role, baseUrl, rawToken, "created");
        auditService.recordEvent(companyId, actor.getId(), "INVITATION_QUEUED", email,
                "Invitation email queued; link valid for seven days.", request);
        return Map.of("success", true, "message", "Invitation email queued.", "invitationId", saved.getId());
    }

    @Transactional(readOnly = true)
    public InvitationValidationResponse validateInvitation(String rawToken) {
        if (!validToken(rawToken)) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("NOT_FOUND")
                    .message("Invalid or missing invitation token.")
                    .build();
        }

        String tokenHash = sha256(rawToken.trim());
        Optional<AgentInvitation> invOpt = invitationRepository.findByTokenHash(tokenHash);

        if (invOpt.isEmpty()) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("NOT_FOUND")
                    .message("Invitation not found. The link may be corrupted or deleted.")
                    .build();
        }

        AgentInvitation invitation = invOpt.get();

        if (invitation.getStatus() == AgentInvitation.InvitationStatus.REVOKED) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("REVOKED")
                    .message("This invitation is no longer valid. It has been revoked by your workspace administrator.")
                    .build();
        }

        if (invitation.getStatus() == AgentInvitation.InvitationStatus.ACCEPTED) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("USED")
                    .message("This invitation has already been used. Please proceed to the sign-in page.")
                    .build();
        }

        if (invitation.getExpiresAt() == null || !invitation.getExpiresAt().isAfter(LocalDateTime.now())
                || invitation.getStatus() == AgentInvitation.InvitationStatus.EXPIRED) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("EXPIRED")
                    .message("This invitation has expired (7-day validity). Ask your administrator to send a new invitation.")
                    .build();
        }

        Company company = invitation.getCompanyId() != null
                ? companyRepository.findById(invitation.getCompanyId()).orElse(null) : null;
        Role role = invitation.getRoleId() != null ? roleRepository.findById(invitation.getRoleId()).orElse(null) : null;
        if (invitation.getStatus() != AgentInvitation.InvitationStatus.PENDING || company == null
                || (company.getStatus() != Company.CompanyStatus.ACTIVE && company.getStatus() != Company.CompanyStatus.TRIAL)
                || !allowedRole(role, company.getId())) {
            return InvitationValidationResponse.builder().valid(false).status("NOT_FOUND")
                    .message(INVALID_INVITATION).build();
        }
        User inviter = invitation.getInvitedByUserId() != null
                ? userRepository.findById(invitation.getInvitedByUserId()).orElse(null) : null;
        String inviterName = inviter != null ? inviter.getDisplayName() : "Workspace Admin";

        return InvitationValidationResponse.builder()
                .valid(true)
                .status("VALID")
                .message("Invitation is active and valid.")
                .email(invitation.getEmail())
                .name(invitation.getName())
                .companyName(company.getName())
                .companySubdomain(company.getSubdomain())
                .companyLogo(company.getLogoUrl())
                .inviterName(inviterName)
                .roleName(role.getName())
                .build();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public LoginResponse acceptInvitation(AcceptInvitationRequest req, HttpServletRequest request) {
        if (req == null || !validToken(req.getToken())) {
            throw new IllegalArgumentException(INVALID_INVITATION);
        }
        if (!Boolean.TRUE.equals(req.getAgreedToTerms())) {
            throw new IllegalArgumentException("You must accept the Terms of Service and Privacy Policy to join the workspace.");
        }
        PasswordPolicy.validate(req.getPassword());

        String tokenHash = sha256(req.getToken().trim());
        // A scalar hint avoids caching an invitation before the shared company seat lock is acquired.
        Long companyId = invitationRepository.findCompanyIdByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        Company company = lockCompany(companyId);
        requireActiveCompany(company);
        AgentInvitation invitation = invitationRepository.findForConsumptionByTokenHash(tokenHash)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        if (!companyId.equals(invitation.getCompanyId()) || !tokenHash.equals(invitation.getTokenHash())
                || invitation.getStatus() != AgentInvitation.InvitationStatus.PENDING || invitation.getRoleId() == null
                || invitation.getExpiresAt() == null || !invitation.getExpiresAt().isAfter(LocalDateTime.now())) {
            throw new IllegalArgumentException(INVALID_INVITATION);
        }
        Role role = resolveRole(invitation.getRoleId(), companyId);
        String email = invitation.getEmail() != null ? invitation.getEmail().trim().toLowerCase(Locale.ROOT) : "";
        validateIdentity(email, invitation.getName());
        Optional<User> existing = userRepository.findForAuthenticationByCompanyAndEmail(companyId, email);
        existing.ifPresent(user -> requireInvitableAccount(user, companyId, email));
        assertSeatAvailable(company, email);

        String encodedPassword = passwordEncoder.encode(req.getPassword());
        User user = existing.orElseGet(User::new);
        user.setCompany(company);
        user.setEmail(email);
        // Acceptance cannot replace the identity or role approved by the inviting administrator.
        user.setDisplayName(invitation.getName().trim());
        String[] names = user.getDisplayName().split("\\s+", 2);
        user.setFirstName(names[0]);
        user.setLastName(names.length > 1 ? names[1] : null);
        user.setPasswordHash(encodedPassword);
        if (existing.isPresent()) {
            user.invalidateAuthentication();
        }
        user.setRole(role);
        user.setIsActive(true);
        user.setStatus("ACTIVE");
        user.setFailedLoginAttempts(0);
        user.setLockoutUntil(null);
        user.setLastLoginAt(LocalDateTime.now());
        User savedUser = userRepository.save(user);

        invitation.setStatus(AgentInvitation.InvitationStatus.ACCEPTED);
        invitationRepository.save(invitation);
        revokeOtherInvitations(companyId, email, invitation.getId());

        String token = jwtTokenProvider.generateToken(savedUser);
        if (token == null || token.isBlank()) {
            throw new IllegalStateException("AUTHENTICATION_TOKEN_NOT_AVAILABLE");
        }
        auditService.recordEvent(
                company.getId(),
                savedUser.getId(),
                "INVITATION_ACCEPTED",
                email,
                "Joined " + company.getName() + " as " + role.getName(),
                request
        );

        LoginResponse.CompanyInfo compInfo = LoginResponse.CompanyInfo.builder()
                .id(company.getId())
                .companyCode(company.getCompanyCode())
                .name(company.getName())
                .subdomain(company.getSubdomain())
                .status(company.getStatus().name())
                .primaryColor(company.getPrimaryColor())
                .planName(company.getPlanName())
                .build();

        return LoginResponse.builder()
                .token(token)
                .userId(savedUser.getId())
                .email(savedUser.getEmail())
                .firstName(savedUser.getFirstName())
                .lastName(savedUser.getLastName())
                .displayName(savedUser.getDisplayName())
                .roleType(role.getRoleType().name())
                .roleName(role.getName())
                .company(compInfo)
                .build();
    }

    @Transactional(readOnly = true)
    public List<AgentInvitationDto> getPendingInvitations(Long companyId) {
        requireAdmin(companyId, TenantContext.requireUserId());
        List<AgentInvitation> list = invitationRepository.findByCompanyIdOrderByCreatedAtDesc(companyId);
        List<AgentInvitationDto> dtos = new ArrayList<>();
        for (AgentInvitation inv : list) {
            Role role = roleRepository.findById(inv.getRoleId()).orElse(null);
            User inviter = userRepository.findById(inv.getInvitedByUserId()).orElse(null);
            dtos.add(AgentInvitationDto.builder()
                    .id(inv.getId())
                    .email(inv.getEmail())
                    .name(inv.getName())
                    .roleId(inv.getRoleId())
                    .roleName(role != null ? role.getName() : "Agent")
                    .inviterName(inviter != null ? inviter.getDisplayName() : "Admin")
                    .status(inv.getStatus().name())
                    .expiresAt(inv.getExpiresAt())
                    .createdAt(inv.getCreatedAt())
                    .build());
        }
        return dtos;
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> resendInvitation(Long invitationId, Long adminUserId, HttpServletRequest request) {
        requireActorId(adminUserId);
        Long companyId = invitationRepository.findCompanyIdByInvitationId(invitationId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        User actor = requireAdmin(companyId, adminUserId);
        accountEmailService.requireReady();
        String baseUrl = frontendBaseUrl();
        Company company = lockCompany(companyId);
        requireActiveCompany(company);
        AgentInvitation invitation = invitationRepository.findForUpdateByIdAndCompanyId(invitationId, companyId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        requireUnusedInvitation(invitation, companyId);
        if (invitation.getRoleId() == null) throw new SecurityException("The invited role is no longer available.");
        Role role = resolveRole(invitation.getRoleId(), companyId);
        String email = invitation.getEmail() != null ? invitation.getEmail().trim().toLowerCase(Locale.ROOT) : "";
        validateIdentity(email, invitation.getName());
        userRepository.findForAuthenticationByCompanyAndEmail(companyId, email)
                .ifPresent(user -> requireInvitableAccount(user, companyId, email));
        assertSeatAvailable(company, email);
        revokeOtherInvitations(companyId, email, invitationId);

        String rawToken = generateRandomHex(32);
        invitation.setTokenHash(sha256(rawToken));
        invitation.setStatus(AgentInvitation.InvitationStatus.PENDING);
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));
        invitationRepository.save(invitation);
        queueInvitation(invitation, company, role, baseUrl, rawToken, "resend:" + UUID.randomUUID());
        auditService.recordEvent(companyId, actor.getId(), "INVITATION_RESEND_QUEUED", invitation.getEmail(),
                "Replacement invitation email queued; link valid for seven days.", request);
        return Map.of("success", true, "message", "Invitation email queued.", "invitationId", invitationId);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Map<String, Object> revokeInvitation(Long invitationId, Long adminUserId, HttpServletRequest request) {
        requireActorId(adminUserId);
        Long companyId = invitationRepository.findCompanyIdByInvitationId(invitationId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        User actor = requireAdmin(companyId, adminUserId);
        lockCompany(companyId);
        AgentInvitation invitation = invitationRepository.findForUpdateByIdAndCompanyId(invitationId, companyId)
                .orElseThrow(() -> new IllegalArgumentException(INVALID_INVITATION));
        requireUnusedInvitation(invitation, companyId);

        invitation.setStatus(AgentInvitation.InvitationStatus.REVOKED);
        invitationRepository.save(invitation);

        auditService.recordEvent(
                invitation.getCompanyId(),
                actor.getId(),
                "INVITATION_REVOKED",
                invitation.getEmail(),
                "Revoked by administrator",
                request
        );

        return Map.of(
                "success", true,
                "message", "Invitation has been revoked."
        );
    }

    private Long requireActorId(Long suppliedId) {
        Long actorId = TenantContext.requireUserId();
        if (!actorId.equals(suppliedId) || (!TenantContext.isSuperAdmin()
                && !Role.RoleType.COMPANY_ADMIN.name().equals(TenantContext.getUserRole()))) {
            throw new SecurityException("The current company administrator must perform this action.");
        }
        return actorId;
    }

    private User requireAdmin(Long companyId, Long suppliedId) {
        Long actorId = requireActorId(suppliedId);
        TenantContext.assertCompanyAdminAccessTo(companyId);
        User actor = userRepository.findById(actorId)
                .orElseThrow(() -> new SecurityException("The current administrator is unavailable."));
        if (!actorId.equals(actor.getId()) || !Boolean.TRUE.equals(actor.getIsActive())
                || !"ACTIVE".equalsIgnoreCase(actor.getStatus()) || actor.getRole() == null
                || actor.getRole().getRoleType() == null || actor.getCompany() == null
                || actor.getCompany().getId() == null || actor.getCompany().getId() <= 0
                || !Objects.equals(actor.getEmail(), TenantContext.getUserEmail())
                || !actor.getRole().getRoleType().name().equals(TenantContext.getUserRole())) {
            throw new SecurityException("The current administrator is unavailable.");
        }
        if (actor.getRole().getRoleType() == Role.RoleType.SUPER_ADMIN) {
            if (actor.getRole().getCompany() != null || !Boolean.TRUE.equals(actor.getRole().getIsSystemRole())) {
                throw new SecurityException("A system administrator role is required.");
            }
        } else {
            if (actor.getRole().getRoleType() != Role.RoleType.COMPANY_ADMIN
                    || !companyId.equals(actor.getCompany().getId()) || !allowedRole(actor.getRole(), companyId)) {
                throw new SecurityException("Company administrator access is required for this workspace.");
            }
            requireActiveCompany(actor.getCompany());
        }
        return actor;
    }

    private Company lockCompany(Long companyId) {
        if (companyId == null || companyId <= 0) throw new IllegalArgumentException(INVALID_INVITATION);
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Workspace company no longer exists."));
        // Refresh as well as lock: an eager actor relationship may already have loaded this company.
        entityManager.refresh(company, LockModeType.PESSIMISTIC_WRITE);
        if (!companyId.equals(company.getId())) throw new SecurityException("Workspace identity changed.");
        return company;
    }

    private void requireActiveCompany(Company company) {
        if (company.getStatus() != Company.CompanyStatus.ACTIVE && company.getStatus() != Company.CompanyStatus.TRIAL) {
            throw new IllegalStateException("This workspace is not active.");
        }
    }

    private Role resolveRole(Long roleId, Long companyId) {
        Optional<Role> selected = roleId != null ? roleRepository.findById(roleId)
                : roleRepository.findByCompanyIdAndRoleType(companyId, Role.RoleType.AGENT)
                    .filter(role -> role.getRoleType() == Role.RoleType.AGENT && allowedRole(role, companyId))
                    .or(() -> roleRepository.findByCompanyIdOrIsSystemRoleTrue(companyId).stream()
                            .filter(role -> role.getRoleType() == Role.RoleType.AGENT && allowedRole(role, companyId))
                            .findFirst());
        return selected.filter(role -> allowedRole(role, companyId))
                .orElseThrow(() -> new SecurityException("Select an allowed staff role in this workspace."));
    }

    private boolean allowedRole(Role role, Long companyId) {
        return role != null && role.getId() != null && role.getId() > 0 && role.getRoleType() != null
                && STAFF_ROLES.contains(role.getRoleType())
                && (role.getCompany() == null ? Boolean.TRUE.equals(role.getIsSystemRole())
                    : companyId.equals(role.getCompany().getId()));
    }

    private void requireInvitableAccount(User user, Long companyId, String email) {
        if (user.getId() == null || user.getId() <= 0 || user.getCompany() == null
                || !companyId.equals(user.getCompany().getId()) || !email.equalsIgnoreCase(user.getEmail())
                || !allowedRole(user.getRole(), companyId)) {
            throw new SecurityException("This invitation cannot change the existing account.");
        }
        if (!Boolean.FALSE.equals(user.getIsActive()) || !("INACTIVE".equalsIgnoreCase(user.getStatus())
                || "INVITED".equalsIgnoreCase(user.getStatus()) || "PENDING".equalsIgnoreCase(user.getStatus()))) {
            throw new IllegalStateException("An active or unavailable account cannot be replaced by an invitation.");
        }
        // An email link must not bypass an existing account's second factor.
        if (Boolean.TRUE.equals(user.getIsTwoFactorEnabled())) {
            throw new IllegalStateException("An account with two-factor authentication must use its existing sign-in and recovery flow.");
        }
    }

    private void requireUnusedInvitation(AgentInvitation invitation, Long companyId) {
        if (!companyId.equals(invitation.getCompanyId()) || invitation.getStatus() == null
                || !UNUSED_STATUSES.contains(invitation.getStatus())) {
            throw new IllegalArgumentException(INVALID_INVITATION);
        }
    }

    private void assertSeatAvailable(Company company, String email) {
        Integer limit = company.getMaxAgents();
        if (limit != null && limit < 0) throw new IllegalStateException("Workspace seat limits are not configured.");
        Optional<CompanySubscription> configured = subscriptionRepository.findByCompanyId(company.getId());
        LocalDateTime now = LocalDateTime.now();
        if (configured.isPresent()) {
            CompanySubscription subscription = configured.get();
            LocalDateTime end = subscription.getCurrentPeriodEnd();
            LocalDateTime grace = subscription.getGracePeriodEndsAt() != null ? subscription.getGracePeriodEndsAt()
                    : end != null ? end.plusDays(7) : null;
            boolean current = (subscription.getStatus() == CompanySubscription.SubscriptionStatus.ACTIVE
                    || subscription.getStatus() == CompanySubscription.SubscriptionStatus.TRIAL)
                    && end != null && end.isAfter(now);
            boolean inGrace = subscription.getStatus() == CompanySubscription.SubscriptionStatus.PAST_DUE
                    && end != null && grace != null && grace.isAfter(now);
            if (!company.getId().equals(subscription.getCompanyId()) || (!current && !inGrace)
                    || subscription.getCurrentPeriodStart() == null || subscription.getCurrentPeriodStart().isAfter(now)
                    || subscription.getAgentLimit() == null || subscription.getAgentLimit() < 0) {
                throw new IllegalStateException("The workspace subscription does not permit adding staff.");
            }
            limit = limit == null ? subscription.getAgentLimit() : Math.min(limit, subscription.getAgentLimit());
        }
        if (limit == null) throw new IllegalStateException("Workspace seat limits are not configured.");
        long active = userRepository.countByCompanyIdAndIsActiveTrue(company.getId());
        long pending = invitationRepository.countLiveInvitationsExcludingEmail(company.getId(),
                AgentInvitation.InvitationStatus.PENDING, now, email);
        if (active < 0 || pending < 0 || active >= limit || pending >= (long) limit - active) {
            throw new IllegalStateException("The workspace has reached its staff seat limit, including pending invitations.");
        }
    }

    private void revokeOtherInvitations(Long companyId, String email, Long keepId) {
        List<AgentInvitation> unused = invitationRepository.findByCompanyIdAndEmailIgnoreCaseAndStatusIn(
                companyId, email, UNUSED_STATUSES);
        for (AgentInvitation other : unused) {
            if (!Objects.equals(keepId, other.getId())) {
                other.setStatus(AgentInvitation.InvitationStatus.REVOKED);
                invitationRepository.save(other);
            }
        }
    }

    private void queueInvitation(AgentInvitation invitation, Company company, Role role,
                                 String baseUrl, String rawToken, String deliveryId) {
        if (invitation.getId() == null) throw new IllegalStateException("ACCOUNT_EMAIL_ENQUEUE_FAILED");
        String url = baseUrl + "/accept-invitation#token=" + rawToken;
        accountEmailService.enqueue(company.getId(), invitation.getEmail(), "You're invited to Helpdesk",
                "<p>Hello " + HtmlUtils.htmlEscape(invitation.getName()) + ",</p>"
                        + "<p>You were invited to " + HtmlUtils.htmlEscape(Objects.toString(company.getName(), "Helpdesk"))
                        + " as " + HtmlUtils.htmlEscape(Objects.toString(role.getName(), "staff")) + ".</p>"
                        + "<p><a href=\"" + HtmlUtils.htmlEscape(url) + "\">Accept invitation</a></p>"
                        + "<p>This link expires in seven days and can be used only once. "
                        + "If you did not expect this invitation, ignore this email.</p>",
                "agent-invitation:" + invitation.getId() + ":" + deliveryId);
    }

    private void validateIdentity(String email, String name) {
        if (email == null || email.length() > 254 || email.indexOf('@') <= 0
                || email.chars().anyMatch(Character::isISOControl) || name == null || name.isBlank()
                || name.length() > 150 || name.chars().anyMatch(Character::isISOControl)) {
            throw new IllegalArgumentException("A valid staff name and email are required.");
        }
        String[] names = name.trim().split("\\s+", 2);
        if (names[0].length() > 100 || (names.length > 1 && names[1].length() > 100)) {
            throw new IllegalArgumentException("Staff first and last names must each be at most 100 characters.");
        }
        try {
            InternetAddress address = new InternetAddress(email, true);
            address.validate();
            if (address.isGroup() || address.getPersonal() != null || !email.equals(address.getAddress())) {
                throw new IllegalArgumentException();
            }
        } catch (Exception invalid) {
            throw new IllegalArgumentException("A valid staff email is required.");
        }
    }

    private boolean validToken(String rawToken) {
        return rawToken != null && rawToken.length() <= 256 && rawToken.trim().matches("[0-9a-f]{64}");
    }

    private String frontendBaseUrl() {
        try {
            URI uri = URI.create(frontendUrl);
            if (frontendUrl.length() > 2048 || !uri.isAbsolute() || uri.getHost() == null
                    || (!"https".equalsIgnoreCase(uri.getScheme()) && !"http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null
                    || uri.getPort() == 0 || uri.getPort() > 65535 || !uri.equals(uri.normalize())
                    || uri.getPath().contains("..")
                    || uri.getPath().chars().anyMatch(Character::isISOControl)) {
                throw new IllegalArgumentException();
            }
            return uri.toASCIIString().replaceAll("/+$", "");
        } catch (RuntimeException invalid) {
            throw new IllegalStateException("ACCOUNT_EMAIL_NOT_READY");
        }
    }

    private String generateRandomHex(int byteLength) {
        byte[] bytes = new byte[byteLength];
        RANDOM.nextBytes(bytes);
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedHash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hexString = new StringBuilder();
            for (byte b : encodedHash) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) hexString.append('0');
                hexString.append(hex);
            }
            return hexString.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 algorithm not available", e);
        }
    }
}
