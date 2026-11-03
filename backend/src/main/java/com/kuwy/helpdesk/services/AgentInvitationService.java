package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.*;
import com.kuwy.helpdesk.models.AgentInvitation;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.AgentInvitationRepository;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.RoleRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;

@Slf4j
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

    private static final SecureRandom RANDOM = new SecureRandom();

    private static final Map<String, Integer> PLAN_AGENT_LIMITS = Map.of(
            "FREE", 2,
            "STARTER", 5,
            "PRO", 25,
            "PROFESSIONAL", 25,
            "ENTERPRISE", 50
    );

    @Transactional
    public Map<String, Object> inviteAgent(InviteAgentRequest req, Long invitingUserId, Long companyId, HttpServletRequest request) {
        String email = req.getEmail() != null ? req.getEmail().trim().toLowerCase() : "";
        String name = req.getName() != null ? req.getName().trim() : "";

        if (email.isBlank() || name.isBlank()) {
            throw new RuntimeException("Agent name and email are required.");
        }

        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new RuntimeException("Company not found with id: " + companyId));

        User invitingUser = userRepository.findById(invitingUserId)
                .orElseThrow(() -> new RuntimeException("Inviting admin account not found."));

        // 1. Quota check against company plan
        String planName = company.getPlanName() != null ? company.getPlanName().toUpperCase() : "STARTER";
        int maxLimit = PLAN_AGENT_LIMITS.getOrDefault(planName, 5);

        long activeUsers = userRepository.countByCompanyIdAndIsActiveTrue(company.getId());
        long pendingInvites = invitationRepository.countByCompanyIdAndStatus(company.getId(), AgentInvitation.InvitationStatus.PENDING);

        if ((activeUsers + pendingInvites) >= maxLimit) {
            throw new RuntimeException(String.format(
                    "Seat limit reached: Your current %s plan permits up to %d agents (%d active, %d pending). Please upgrade your subscription to invite more team members.",
                    planName, maxLimit, activeUsers, pendingInvites
            ));
        }

        // 2. Check if agent already exists in company
        Optional<User> existingUser = userRepository.findByCompanyIdAndEmail(company.getId(), email);
        if (existingUser.isPresent() && Boolean.TRUE.equals(existingUser.get().getIsActive())) {
            throw new RuntimeException("An active staff account with email '" + email + "' already exists in this workspace.");
        }

        // 3. Resolve Role (defaults to AGENT if roleId is null)
        Role role;
        if (req.getRoleId() != null) {
            role = roleRepository.findById(req.getRoleId())
                    .orElseThrow(() -> new RuntimeException("Role not found with id: " + req.getRoleId()));
        } else {
            role = roleRepository.findFirstByRoleType(Role.RoleType.AGENT)
                    .orElseThrow(() -> new RuntimeException("Default AGENT role not configured in system."));
        }

        // 4. Invalidate any existing pending invite for this email in this company
        Optional<AgentInvitation> existingInvite = invitationRepository.findByCompanyIdAndEmailAndStatus(
                company.getId(), email, AgentInvitation.InvitationStatus.PENDING
        );
        existingInvite.ifPresent(inv -> {
            inv.setStatus(AgentInvitation.InvitationStatus.REVOKED);
            invitationRepository.save(inv);
        });

        // 5. Generate secure token (7 days expiry)
        String rawToken = generateRandomHex(32);
        String tokenHash = sha256(rawToken);

        AgentInvitation invitation = new AgentInvitation();
        invitation.setCompanyId(company.getId());
        invitation.setInvitedByUserId(invitingUser.getId());
        invitation.setEmail(email);
        invitation.setName(name);
        invitation.setRoleId(role.getId());
        invitation.setTokenHash(tokenHash);
        invitation.setStatus(AgentInvitation.InvitationStatus.PENDING);
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));

        AgentInvitation saved = invitationRepository.save(invitation);

        auditService.recordEvent(
                company.getId(),
                invitingUser.getId(),
                "INVITATION_SENT",
                email,
                "Invited " + name + " as " + role.getName() + " (Token expires in 7 days)",
                request
        );

        String inviteUrl = "http://localhost:5174/accept-invitation?token=" + rawToken;
        log.info("Agent invitation link created for {}: {}", email, inviteUrl);

        Map<String, Object> res = new LinkedHashMap<>();
        res.put("success", true);
        res.put("message", "Invitation created successfully and dispatched to " + email);
        res.put("invitationId", saved.getId());
        res.put("inviteUrl", inviteUrl);
        return res;
    }

    public InvitationValidationResponse validateInvitation(String rawToken) {
        if (rawToken == null || rawToken.isBlank()) {
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

        if (invitation.getExpiresAt().isBefore(LocalDateTime.now()) || invitation.getStatus() == AgentInvitation.InvitationStatus.EXPIRED) {
            return InvitationValidationResponse.builder()
                    .valid(false)
                    .status("EXPIRED")
                    .message("This invitation has expired (7-day validity). Ask your administrator to send a new invitation.")
                    .build();
        }

        Company company = companyRepository.findById(invitation.getCompanyId()).orElse(null);
        User inviter = userRepository.findById(invitation.getInvitedByUserId()).orElse(null);
        Role role = roleRepository.findById(invitation.getRoleId()).orElse(null);

        String companyName = company != null ? company.getName() : "Kuwy Helpdesk";
        String companySubdomain = company != null ? company.getSubdomain() : "kuwy";
        String companyLogo = company != null ? company.getLogoUrl() : null;
        String inviterName = inviter != null ? inviter.getDisplayName() : "Workspace Admin";
        String roleName = role != null ? role.getName() : "Support Agent";

        return InvitationValidationResponse.builder()
                .valid(true)
                .status("VALID")
                .message("Invitation is active and valid.")
                .email(invitation.getEmail())
                .name(invitation.getName())
                .companyName(companyName)
                .companySubdomain(companySubdomain)
                .companyLogo(companyLogo)
                .inviterName(inviterName)
                .roleName(roleName)
                .build();
    }

    @Transactional
    public LoginResponse acceptInvitation(AcceptInvitationRequest req, HttpServletRequest request) {
        if (req.getToken() == null || req.getToken().isBlank()) {
            throw new RuntimeException("Invitation token is required.");
        }
        if (!Boolean.TRUE.equals(req.getAgreedToTerms())) {
            throw new RuntimeException("You must accept the Terms of Service and Privacy Policy to join the workspace.");
        }
        if (req.getPassword() == null || req.getPassword().length() < 10) {
            throw new RuntimeException("Password must be at least 10 characters long.");
        }

        validatePassword(req.getPassword());

        String tokenHash = sha256(req.getToken().trim());
        AgentInvitation invitation = invitationRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new RuntimeException("Invalid invitation token."));

        if (invitation.getStatus() != AgentInvitation.InvitationStatus.PENDING) {
            throw new RuntimeException("This invitation cannot be accepted because it is " + invitation.getStatus());
        }

        if (invitation.getExpiresAt().isBefore(LocalDateTime.now())) {
            invitation.setStatus(AgentInvitation.InvitationStatus.EXPIRED);
            invitationRepository.save(invitation);
            throw new RuntimeException("This invitation has expired. Ask your administrator for a new invite link.");
        }

        Company company = companyRepository.findById(invitation.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Workspace company no longer exists."));

        Role role = roleRepository.findById(invitation.getRoleId())
                .orElseThrow(() -> new RuntimeException("Target role no longer exists."));

        // Create or activate user
        String email = invitation.getEmail().toLowerCase().trim();
        User user = userRepository.findByCompanyIdAndEmail(company.getId(), email).orElse(new User());

        user.setCompany(company);
        user.setEmail(email);
        user.setDisplayName(req.getName() != null && !req.getName().isBlank() ? req.getName().trim() : invitation.getName());
        user.setFirstName(user.getDisplayName().split(" ")[0]);
        if (user.getDisplayName().contains(" ")) {
            user.setLastName(user.getDisplayName().substring(user.getDisplayName().indexOf(" ") + 1));
        }
        user.setPasswordHash(passwordEncoder.encode(req.getPassword()));
        user.setRole(role);
        user.setIsActive(true);
        user.setStatus("ACTIVE");
        user.setLastLoginAt(LocalDateTime.now());
        User savedUser = userRepository.save(user);

        // Mark invitation as accepted
        invitation.setStatus(AgentInvitation.InvitationStatus.ACCEPTED);
        invitationRepository.save(invitation);

        auditService.recordEvent(
                company.getId(),
                savedUser.getId(),
                "INVITATION_ACCEPTED",
                email,
                "Joined " + company.getName() + " as " + role.getName(),
                request
        );

        // Generate immediate JWT token for seamless workspace entry
        String token = jwtTokenProvider.generateToken(savedUser);

        LoginResponse.CompanyInfo compInfo = LoginResponse.CompanyInfo.builder()
                .id(company.getId())
                .companyCode(company.getCompanyCode())
                .name(company.getName())
                .subdomain(company.getSubdomain())
                .status(company.getStatus().name())
                .primaryColor(company.getPrimaryColor())
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

    public List<AgentInvitationDto> getPendingInvitations(Long companyId) {
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

    @Transactional
    public Map<String, Object> resendInvitation(Long invitationId, Long adminUserId, HttpServletRequest request) {
        AgentInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new RuntimeException("Invitation not found."));

        String rawToken = generateRandomHex(32);
        invitation.setTokenHash(sha256(rawToken));
        invitation.setStatus(AgentInvitation.InvitationStatus.PENDING);
        invitation.setExpiresAt(LocalDateTime.now().plusDays(7));
        invitationRepository.save(invitation);

        auditService.recordEvent(
                invitation.getCompanyId(),
                adminUserId,
                "INVITATION_RESENT",
                invitation.getEmail(),
                "Regenerated 7-day invitation link",
                request
        );

        String inviteUrl = "http://localhost:5174/accept-invitation?token=" + rawToken;
        log.info("Invitation resent for {}: {}", invitation.getEmail(), inviteUrl);

        return Map.of(
                "success", true,
                "message", "New invitation link generated successfully.",
                "inviteUrl", inviteUrl
        );
    }

    @Transactional
    public Map<String, Object> revokeInvitation(Long invitationId, Long adminUserId, HttpServletRequest request) {
        AgentInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new RuntimeException("Invitation not found."));

        invitation.setStatus(AgentInvitation.InvitationStatus.REVOKED);
        invitationRepository.save(invitation);

        auditService.recordEvent(
                invitation.getCompanyId(),
                adminUserId,
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

    private void validatePassword(String password) {
        boolean hasUpper = password.chars().anyMatch(Character::isUpperCase);
        boolean hasLower = password.chars().anyMatch(Character::isLowerCase);
        boolean hasDigit = password.chars().anyMatch(Character::isDigit);
        boolean hasSpecial = password.chars().anyMatch(ch -> "!@#$%^&*()_+-=[]{}|;':,.<>?".indexOf(ch) >= 0);

        if (!hasUpper || !hasLower || !hasDigit || !hasSpecial) {
            throw new RuntimeException("Password must contain uppercase, lowercase, numbers, and at least one special character.");
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
