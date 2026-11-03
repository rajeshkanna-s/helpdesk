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
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;

/**
 * Onboarding & Self-Serve SaaS Provisioning Controller
 * Implements Section A: Public & Marketing (Screens 1 - 5)
 * - Subdomain availability checking & reserved word protection
 * - Blind email verification dispatch
 * - Atomic workspace provisioning in a single transaction
 * - Server-side plan pricing and GST tax calculations
 */
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
    private final CannedResponseRepository cannedResponseRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    private static final Set<String> RESERVED_SUBDOMAINS = Set.of(
            "admin", "adminconsole", "api", "app", "auth", "billing", "blog",
            "cdn", "dashboard", "dev", "docs", "help", "internal", "kuwy",
            "mail", "portal", "root", "smtp", "status", "superadmin", "support",
            "test", "web", "www", "secure", "login", "signup", "pricing"
    );

    /**
     * 1. Subdomain Availability Check (Screen 3)
     */
    @GetMapping("/check-subdomain")
    public ResponseEntity<Map<String, Object>> checkSubdomain(@RequestParam String slug) {
        String cleanSlug = slug.trim().toLowerCase().replaceAll("[^a-z0-9-]", "");
        Map<String, Object> resp = new HashMap<>();

        if (cleanSlug.length() < 3 || cleanSlug.length() > 30) {
            resp.put("available", false);
            resp.put("reason", "Workspace address must be between 3 and 30 characters.");
            return ResponseEntity.ok(resp);
        }

        if (RESERVED_SUBDOMAINS.contains(cleanSlug)) {
            resp.put("available", false);
            resp.put("reason", "This workspace address is reserved for system services.");
            return ResponseEntity.ok(resp);
        }

        boolean exists = companyRepository.findBySubdomain(cleanSlug).isPresent();
        if (exists) {
            resp.put("available", false);
            resp.put("reason", "This workspace address is already taken.");
            resp.put("suggested", cleanSlug + "-" + (new Random().nextInt(900) + 100));
        } else {
            resp.put("available", true);
            resp.put("slug", cleanSlug);
        }
        return ResponseEntity.ok(resp);
    }

    /**
     * 2. Public Plans Catalog (Screen 2)
     */
    @GetMapping("/plans")
    public ResponseEntity<List<Map<String, Object>>> getPlans() {
        List<Map<String, Object>> plans = new ArrayList<>();

        Map<String, Object> freePlan = new LinkedHashMap<>();
        freePlan.put("id", "FREE");
        freePlan.put("name", "Free");
        freePlan.put("tagline", "For individuals and micro-teams starting out");
        freePlan.put("priceMonthlyINR", 0);
        freePlan.put("priceAnnualINR", 0);
        freePlan.put("agentsIncluded", 2);
        freePlan.put("ticketLimitMonthly", 100);
        freePlan.put("emailForwarding", true);
        freePlan.put("m365Oauth", false);
        freePlan.put("slaAutomation", false);
        freePlan.put("customDomain", false);
        freePlan.put("reports", "Basic");
        freePlan.put("recommended", false);
        freePlan.put("features", List.of(
                "Up to 2 Support Agents",
                "100 Tickets / month",
                "Email forwarding (Gmail & Outlook)",
                "Public Customer Portal",
                "Basic Ticket Filtering & Search",
                "Community Support"
        ));
        plans.add(freePlan);

        Map<String, Object> starterPlan = new LinkedHashMap<>();
        starterPlan.put("id", "STARTER");
        starterPlan.put("name", "Starter");
        starterPlan.put("tagline", "Growing teams that need automated SLA routing");
        starterPlan.put("priceMonthlyINR", 2499);
        starterPlan.put("priceAnnualINR", 1999);
        starterPlan.put("agentsIncluded", 5);
        starterPlan.put("ticketLimitMonthly", 1500);
        starterPlan.put("emailForwarding", true);
        starterPlan.put("m365Oauth", false);
        starterPlan.put("slaAutomation", true);
        starterPlan.put("customDomain", true);
        starterPlan.put("reports", "Standard");
        starterPlan.put("recommended", true);
        starterPlan.put("features", List.of(
                "Up to 5 Support Agents",
                "1,500 Tickets / month",
                "Email forwarding (Gmail, Outlook & M365)",
                "Custom Subdomain & Brand Logo",
                "Automated SLA Policies & Reminders",
                "Canned Responses & Macros",
                "Department Round-Robin Auto-Assignment",
                "Document & File Attachments (25MB)",
                "Standard Telemetry & Export"
        ));
        plans.add(starterPlan);

        Map<String, Object> proPlan = new LinkedHashMap<>();
        proPlan.put("id", "PRO");
        proPlan.put("name", "Pro");
        proPlan.put("tagline", "Full-scale omnichannel support for modern companies");
        proPlan.put("priceMonthlyINR", 5999);
        proPlan.put("priceAnnualINR", 4799);
        proPlan.put("agentsIncluded", 25);
        proPlan.put("ticketLimitMonthly", 10000);
        proPlan.put("emailForwarding", true);
        proPlan.put("m365Oauth", true);
        proPlan.put("slaAutomation", true);
        proPlan.put("customDomain", true);
        proPlan.put("reports", "Advanced & Scheduled");
        proPlan.put("recommended", false);
        proPlan.put("features", List.of(
                "Up to 25 Support Agents (expandable)",
                "Unlimited Tickets (fair use 10,000/mo)",
                "Direct Microsoft 365 & Gmail OAuth Integration",
                "Unlimited Custom Departments & Routing",
                "Advanced Multi-Tier SLA Escalation Rules",
                "Custom Portal CSS & Domain Mapping",
                "MIS Tracking & Agent KPI Telemetry",
                "Role-Based Access Control & Audit Logs",
                "Priority 24/7 Enterprise Support"
        ));
        plans.add(proPlan);

        return ResponseEntity.ok(plans);
    }

    /**
     * 3. Send Verification Code (Screen 4a - Blind response to prevent user enumeration)
     */
    @PostMapping("/send-verification")
    public ResponseEntity<Map<String, Object>> sendVerification(@RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || !email.contains("@")) {
            return ResponseEntity.badRequest().body(Map.of("error", "Please provide a valid work email."));
        }

        // Blind response: Always returns generic confirmation message
        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("message", "If this email is new, we've sent a 6-digit verification code to " + email);
        resp.put("expiresInSeconds", 600);
        resp.put("mockCode", "849201"); // Dev verification code
        return ResponseEntity.ok(resp);
    }

    /**
     * 4. Verify & Provision Workspace (Screen 4b - Atomic All-or-Nothing Transaction)
     */
    @PostMapping("/signup")
    @Transactional
    public ResponseEntity<LoginResponse> signup(@RequestBody OnboardingRequest dto) {
        String slug = dto.getSubdomain().trim().toLowerCase().replaceAll("[^a-z0-9-]", "");

        if (slug.length() < 3 || RESERVED_SUBDOMAINS.contains(slug)) {
            throw new IllegalArgumentException("Invalid or reserved workspace address: " + slug);
        }

        if (companyRepository.findBySubdomain(slug).isPresent()) {
            throw new IllegalArgumentException("Subdomain '" + slug + "' is already in use.");
        }

        // 1. Create Company (Tenant)
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

        // 3. Create Subscription Record (14-day full feature trial)
        CompanySubscription.PlanTier tier = CompanySubscription.PlanTier.valueOf(company.getPlanName());
        CompanySubscription sub = new CompanySubscription();
        sub.setCompany(savedCompany);
        sub.setPlanTier(tier);
        sub.setStatus(CompanySubscription.SubscriptionStatus.ACTIVE);
        sub.setCurrentPeriodStart(LocalDateTime.now());
        sub.setCurrentPeriodEnd(LocalDateTime.now().plusDays(14)); // 14-day trial

        if (tier == CompanySubscription.PlanTier.FREE) {
            sub.setAmount(BigDecimal.ZERO);
            sub.setAgentLimit(2);
            sub.setTicketLimitMonthly(100);
        } else if (tier == CompanySubscription.PlanTier.STARTER) {
            sub.setAmount(BigDecimal.valueOf(2499.00));
            sub.setAgentLimit(5);
            sub.setTicketLimitMonthly(1500);
        } else {
            sub.setAmount(BigDecimal.valueOf(5999.00));
            sub.setAgentLimit(25);
            sub.setTicketLimitMonthly(10000);
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

        // 5. Create Default Canned Responses
        CannedResponse cr1 = new CannedResponse();
        cr1.setCompany(savedCompany);
        cr1.setTitle("Welcome & Ticket Acknowledgment");
        cr1.setShortcut("welcome");
        cr1.setContent("Hi {{contact.name}},\n\nThank you for reaching out to " + savedCompany.getName() + " support. We have received your request and our engineering team is actively looking into it.\n\nBest regards,\nSupport Team");
        cannedResponseRepository.save(cr1);

        CannedResponse cr2 = new CannedResponse();
        cr2.setCompany(savedCompany);
        cr2.setTitle("Request More Information");
        cr2.setShortcut("moreinfo");
        cr2.setContent("Hi {{contact.name}},\n\nCould you please provide additional details or a screenshot to help us reproduce the issue?\n\nThank you!");
        cannedResponseRepository.save(cr2);

        // 6. Create Initial Admin User
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

        // 7. Generate JWT Auth Token & Response
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

        log.info("Provisioned new tenant workspace: {} ({}) with admin {}", savedCompany.getName(), slug, savedAdmin.getEmail());
        return ResponseEntity.ok(response);
    }

    /**
     * 5. Server-Side Price Calculation & GST Breakdown (Screen 5a & 5b)
     */
    @PostMapping("/calculate-checkout")
    public ResponseEntity<Map<String, Object>> calculateCheckout(@RequestBody CheckoutCalcRequest req) {
        String planTier = req.getPlanTier() != null ? req.getPlanTier().toUpperCase() : "STARTER";
        boolean isAnnual = Boolean.TRUE.equals(req.getIsAnnual());
        int agentCount = req.getAgentCount() > 0 ? req.getAgentCount() : 5;

        BigDecimal baseMonthly;
        int baseAgents;
        if ("PRO".equals(planTier)) {
            baseMonthly = isAnnual ? BigDecimal.valueOf(4799) : BigDecimal.valueOf(5999);
            baseAgents = 25;
        } else if ("FREE".equals(planTier)) {
            baseMonthly = BigDecimal.ZERO;
            baseAgents = 2;
        } else {
            baseMonthly = isAnnual ? BigDecimal.valueOf(1999) : BigDecimal.valueOf(2499);
            baseAgents = 5;
        }

        // Additional agents beyond plan base: ₹499/agent/month
        int extraAgents = Math.max(0, agentCount - baseAgents);
        BigDecimal extraAgentCost = BigDecimal.valueOf(extraAgents).multiply(BigDecimal.valueOf(499));

        BigDecimal monthlySubtotal = baseMonthly.add(extraAgentCost);
        BigDecimal subtotal = isAnnual ? monthlySubtotal.multiply(BigDecimal.valueOf(12)) : monthlySubtotal;

        // 18% GST (Indian Tax compliance)
        BigDecimal gstRate = BigDecimal.valueOf(0.18);
        BigDecimal gstAmount = subtotal.multiply(gstRate).setScale(2, RoundingMode.HALF_UP);
        BigDecimal grandTotal = subtotal.add(gstAmount).setScale(2, RoundingMode.HALF_UP);

        // Validate GSTIN if provided (Format: 2 digits, 5 letters, 4 digits, 1 letter, 1 alphanumeric, 'Z', 1 alphanumeric)
        boolean gstinValid = true;
        if (req.getGstin() != null && !req.getGstin().isBlank()) {
            gstinValid = req.getGstin().trim().matches("^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$");
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("planTier", planTier);
        resp.put("billingCycle", isAnnual ? "ANNUAL" : "MONTHLY");
        resp.put("basePrice", baseMonthly);
        resp.put("extraAgents", extraAgents);
        resp.put("extraAgentCost", extraAgentCost);
        resp.put("subtotal", subtotal);
        resp.put("gstRate", "18%");
        resp.put("gstAmount", gstAmount);
        resp.put("grandTotal", grandTotal);
        resp.put("currency", "INR");
        resp.put("gstinValid", gstinValid);
        resp.put("mockOrderId", "order_rzp_" + System.currentTimeMillis());

        return ResponseEntity.ok(resp);
    }

    @Data
    public static class OnboardingRequest {
        private String companyName;
        private String subdomain;
        private String adminEmail;
        private String adminPassword;
        private String adminName;
        private String planTier;
    }

    @Data
    public static class CheckoutCalcRequest {
        private String planTier;
        private Boolean isAnnual;
        private int agentCount;
        private String gstin;
    }
}
