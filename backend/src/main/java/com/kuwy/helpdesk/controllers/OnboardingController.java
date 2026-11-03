package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.config.JwtTokenProvider;
import com.kuwy.helpdesk.dto.LoginResponse;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Slf4j
@RestController
@RequestMapping("/api/v1/onboarding")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class OnboardingController {

    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final CompanyMailboxRepository mailboxRepository;
    private final CompanySubscriptionRepository subscriptionRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    @PostMapping("/signup")
    @Transactional
    public ResponseEntity<LoginResponse> signup(@RequestBody OnboardingRequest dto) {
        String slug = dto.getSubdomain().trim().toLowerCase().replaceAll("[^a-z0-9-]", "");

        if (companyRepository.findBySubdomain(slug).isPresent()) {
            throw new IllegalArgumentException("Subdomain '" + slug + "' is already in use.");
        }

        // 1. Create Company
        Company company = new Company();
        company.setName(dto.getCompanyName().trim());
        company.setSubdomain(slug);
        String code = slug.toUpperCase();
        if (code.length() > 6) code = code.substring(0, 6);
        company.setCompanyCode(code);
        company.setStatus(Company.CompanyStatus.ACTIVE);
        company.setPlanName(dto.getPlanTier() != null ? dto.getPlanTier().toUpperCase() : "STARTER");
        company.setMaxAgents("PRO".equalsIgnoreCase(dto.getPlanTier()) ? 25 : "FREE".equalsIgnoreCase(dto.getPlanTier()) ? 2 : 5);
        company.setPrimaryColor("#0d6efd");
        Company savedCompany = companyRepository.save(company);

        // 2. Create Default Department
        Department dept = new Department();
        dept.setCompany(savedCompany);
        dept.setName("Customer Support");
        dept.setCode("SUP");
        dept.setDescription("General customer service and technical support inquiries");
        dept.setIsActive(true);
        Department savedDept = departmentRepository.save(dept);

        // 3. Create Subscription
        CompanySubscription.PlanTier tier = CompanySubscription.PlanTier.valueOf(company.getPlanName());
        CompanySubscription sub = new CompanySubscription();
        sub.setCompany(savedCompany);
        sub.setPlanTier(tier);
        sub.setStatus(CompanySubscription.SubscriptionStatus.ACTIVE);
        sub.setCurrentPeriodStart(LocalDateTime.now());
        sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(30));

        if (tier == CompanySubscription.PlanTier.FREE) {
            sub.setAmount(BigDecimal.ZERO);
            sub.setAgentLimit(2);
            sub.setTicketLimitMonthly(100);
        } else if (tier == CompanySubscription.PlanTier.STARTER) {
            sub.setAmount(BigDecimal.valueOf(2499.00));
            sub.setAgentLimit(5);
            sub.setTicketLimitMonthly(1000);
        } else {
            sub.setAmount(BigDecimal.valueOf(5999.00));
            sub.setAgentLimit(25);
            sub.setTicketLimitMonthly(5000);
        }
        subscriptionRepository.save(sub);

        // 4. Create Initial Mailbox with Forwarding Target
        CompanyMailbox mailbox = new CompanyMailbox();
        mailbox.setCompany(savedCompany);
        mailbox.setDepartment(savedDept);
        mailbox.setMailboxName(savedCompany.getName() + " HelpDesk");
        mailbox.setEmailAddress("support@" + slug + ".com");
        mailbox.setForwardingAddress((1000000000L + savedCompany.getId() * 37) + "@tickets.helpdesk.com");
        mailbox.setForwardingVerified(false);
        mailbox.setProviderType(CompanyMailbox.MailProviderType.FORWARDING);
        mailbox.setAuthType(CompanyMailbox.AuthType.FORWARD_ONLY);
        mailbox.setSyncStatus(CompanyMailbox.SyncStatus.CONNECTED);
        mailbox.setSendAsName(savedCompany.getName() + " Support");
        mailbox.setReplyToAddress("support@" + slug + ".com");
        mailbox.setIsActive(true);
        mailboxRepository.save(mailbox);

        // 5. Create Initial Admin User
        Role adminRole = roleRepository.findFirstByRoleType(Role.RoleType.COMPANY_ADMIN)
                .orElseGet(() -> {
                    Role r = new Role();
                    r.setName("COMPANY_ADMIN");
                    r.setRoleType(Role.RoleType.COMPANY_ADMIN);
                    r.setDescription("Full tenant administrator");
                    return roleRepository.save(r);
                });

        User adminUser = new User();
        adminUser.setCompany(savedCompany);
        adminUser.setEmail(dto.getAdminEmail().trim().toLowerCase());
        adminUser.setPasswordHash(passwordEncoder.encode(dto.getAdminPassword()));
        adminUser.setFirstName(dto.getAdminName() != null ? dto.getAdminName() : "Admin");
        adminUser.setLastName(savedCompany.getCompanyCode());
        adminUser.setDisplayName(adminUser.getFirstName() + " (" + savedCompany.getCompanyCode() + ")");
        adminUser.setRole(adminRole);
        adminUser.setIsActive(true);
        User savedAdmin = userRepository.save(adminUser);

        // 6. Generate JWT Auth Token & Response
        String token = jwtTokenProvider.generateToken(savedAdmin);

        LoginResponse response = LoginResponse.builder()
                .token(token)
                .userId(savedAdmin.getId())
                .email(savedAdmin.getEmail())
                .firstName(savedAdmin.getFirstName())
                .lastName(savedAdmin.getLastName())
                .displayName(savedAdmin.getDisplayName())
                .roleType(savedAdmin.getRole().getRoleType().name())
                .roleName(savedAdmin.getRole().getName())
                .company(LoginResponse.CompanyInfo.builder()
                        .id(savedCompany.getId())
                        .companyCode(savedCompany.getCompanyCode())
                        .name(savedCompany.getName())
                        .subdomain(savedCompany.getSubdomain())
                        .status(savedCompany.getStatus().name())
                        .primaryColor(savedCompany.getPrimaryColor())
                        .build())
                .build();

        log.info("Successfully provisioned new tenant workspace: {} ({}) with admin {}", savedCompany.getName(), slug, savedAdmin.getEmail());
        return ResponseEntity.ok(response);
    }

    @Data
    public static class OnboardingRequest {
        private String companyName;
        private String subdomain;
        private String adminEmail;
        private String adminPassword;
        private String adminName;
        private String planTier; // FREE, STARTER, PRO
    }
}
