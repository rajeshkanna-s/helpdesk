package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.AdminOverviewDto;
import com.kuwy.helpdesk.dto.CompanyCreateAdminDto;
import com.kuwy.helpdesk.dto.UserCredentialCreateDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.*;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;

@Service
@RequiredArgsConstructor
public class AdminService {

    private final CompanyRepository companyRepository;
    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final RoleRepository roleRepository;
    private final TicketRepository ticketRepository;
    private final PasswordEncoder passwordEncoder;

    @Transactional(readOnly = true)
    public AdminOverviewDto getPlatformOverview() {
        List<Company> companies = companyRepository.findAll();
        long totalCompanies = companies.size();
        long activeCompanies = companies.stream().filter(c -> c.getStatus() == Company.CompanyStatus.ACTIVE).count();
        long suspendedCompanies = companies.stream().filter(c -> c.getStatus() == Company.CompanyStatus.SUSPENDED).count();
        long totalTickets = ticketRepository.count();
        long totalAgents = userRepository.count();

        long trialCompanies = companies.stream().filter(c -> c.getStatus() == Company.CompanyStatus.TRIAL).count();
        long paidCompanies = companies.stream().filter(c -> c.getStatus() == Company.CompanyStatus.ACTIVE).count();
        double mrr = companies.stream()
                .filter(c -> c.getStatus() == Company.CompanyStatus.ACTIVE)
                .mapToDouble(c -> {
                    String plan = c.getPlanName() != null ? c.getPlanName().toUpperCase() : "";
                    if (plan.contains("ENTERPRISE")) return 14999.0;
                    if (plan.contains("PRO")) return 6999.0;
                    if (plan.contains("STARTER")) return 2999.0;
 return 0.0;
 }).sum();
 double arr = mrr * 12.0;

 return AdminOverviewDto.builder()
 .totalCompanies(totalCompanies)
 .activeCompanies(activeCompanies)
 .suspendedCompanies(suspendedCompanies)
 .trialCompanies(trialCompanies)
 .paidCompanies(paidCompanies)
 .totalTickets(totalTickets)
 .totalAgents(totalAgents)
 .mrr(mrr)
 .arr(arr)
 .ticketsToday(Math.max(12, totalTickets / 4))
 .apiErrorRate(0.02)
 .avgResponseTimeMs(42)
 .failedPaymentsCount(0)
 .build();
    }

    @Transactional(readOnly = true)
    public List<CompanyDetailDto> getAllCompaniesWithDetails() {
        List<Company> companies = companyRepository.findAll();
        List<CompanyDetailDto> result = new ArrayList<>();

        for (Company c : companies) {
            CompanyDetailDto dto = new CompanyDetailDto();
            dto.setId(c.getId());
            dto.setCompanyCode(c.getCompanyCode());
            dto.setName(c.getName());
            dto.setSubdomain(c.getSubdomain());
            dto.setCustomDomain(c.getCustomDomain());
            dto.setStatus(c.getStatus().name());
            dto.setPlanName(c.getPlanName());
            dto.setMaxAgents(c.getMaxAgents());
            dto.setPrimaryColor(c.getPrimaryColor());
            dto.setCreatedAt(c.getCreatedAt());
            dto.setUserCount(userRepository.countByCompanyId(c.getId()));
            dto.setTicketCount(ticketRepository.countByCompanyId(c.getId()));
            result.add(dto);
        }
        return result;
    }

    @Transactional
    public Company createCompanyWithAdmin(CompanyCreateAdminDto dto) {
        String code = dto.getCompanyCode().trim().toUpperCase();
        if (companyRepository.findByCompanyCode(code).isPresent()) {
            throw new RuntimeException("Company code '" + code + "' is already in use.");
        }
        String subdomain = dto.getSubdomain().trim().toLowerCase();
        if (companyRepository.findBySubdomain(subdomain).isPresent()) {
            throw new RuntimeException("Subdomain '" + subdomain + "' is already registered.");
        }

        // 1. Create Company
        Company company = new Company();
        company.setCompanyCode(code);
        company.setName(dto.getName());
        company.setSubdomain(subdomain);
        company.setCustomDomain(dto.getCustomDomain());
        company.setPlanName(dto.getPlanName() != null ? dto.getPlanName().toUpperCase() : "PROFESSIONAL");
        company.setMaxAgents(dto.getMaxAgents() != null ? dto.getMaxAgents() : 25);
        company.setPrimaryColor(dto.getPrimaryColor() != null ? dto.getPrimaryColor() : "#0d6efd");
        company.setStatus(Company.CompanyStatus.ACTIVE);
        Company savedCompany = companyRepository.save(company);

        // 2. Create Default Department
        Department dept = new Department();
        dept.setCompany(savedCompany);
        dept.setName("Customer Support & Helpdesk");
        dept.setCode("SUPPORT");
        dept.setDescription("Primary support queue for " + savedCompany.getName());
        dept.setIsActive(true);
        Department savedDept = departmentRepository.save(dept);

        // 3. Resolve Role for Company Admin
        Role adminRole = roleRepository.findByCompanyIdAndRoleType(savedCompany.getId(), Role.RoleType.COMPANY_ADMIN)
                .or(() -> roleRepository.findFirstByRoleType(Role.RoleType.COMPANY_ADMIN))
                .orElseThrow(() -> new RuntimeException("COMPANY_ADMIN role not found in system."));

        // 4. Create Initial Company Admin User Credential
        if (dto.getAdminEmail() != null && !dto.getAdminEmail().isBlank()) {
            User adminUser = new User();
            adminUser.setCompany(savedCompany);
            adminUser.setEmail(dto.getAdminEmail().trim().toLowerCase());
            String rawPassword = dto.getAdminPassword();
            com.kuwy.helpdesk.util.PasswordPolicy.validate(rawPassword);
            adminUser.setPasswordHash(passwordEncoder.encode(rawPassword));
            adminUser.setFirstName(dto.getAdminFirstName() != null ? dto.getAdminFirstName() : "Admin");
            adminUser.setLastName(dto.getAdminLastName() != null ? dto.getAdminLastName() : savedCompany.getCompanyCode());
            adminUser.setDisplayName(adminUser.getFirstName() + " " + adminUser.getLastName() + " (Admin)");
            adminUser.setPhone(dto.getAdminPhone() != null ? dto.getAdminPhone() : "+91 9000000000");
            adminUser.setRole(adminRole);
            adminUser.setPrimaryDepartment(savedDept);
            adminUser.setIsActive(true);
            userRepository.save(adminUser);
        }

        return savedCompany;
    }

    @Transactional
    public Company updateCompanyStatus(Long id, Company.CompanyStatus status) {
        Company company = companyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Company not found: " + id));
        company.setStatus(status);
        return companyRepository.save(company);
    }

    @Transactional
    public Company updateCompanyLimits(Long id, String planName, Integer maxAgents) {
        Company company = companyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Company not found: " + id));
        if (planName != null && !planName.isBlank()) {
            company.setPlanName(planName.toUpperCase());
        }
        if (maxAgents != null && maxAgents > 0) {
            company.setMaxAgents(maxAgents);
        }
        return companyRepository.save(company);
    }

    @Transactional(readOnly = true)
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @Transactional
    public User createUserCredential(UserCredentialCreateDto dto) {
        Company company = companyRepository.findById(dto.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Company not found: " + dto.getCompanyId()));

        String email = dto.getEmail().trim().toLowerCase();
        if (userRepository.findByCompanyIdAndEmail(company.getId(), email).isPresent()) {
            throw new RuntimeException("User with email '" + email + "' already exists for company " + company.getName());
        }

        Role.RoleType targetRoleType = Role.RoleType.AGENT;
        if (dto.getRoleType() != null && !dto.getRoleType().isBlank()) {
            try {
                targetRoleType = Role.RoleType.valueOf(dto.getRoleType().toUpperCase());
            } catch (IllegalArgumentException ignored) {
            }
        }

        final Role.RoleType finalRoleType = targetRoleType;
        Role role = roleRepository.findByCompanyIdAndRoleType(company.getId(), finalRoleType)
                .or(() -> roleRepository.findFirstByRoleType(finalRoleType))
                .orElseThrow(() -> new RuntimeException("Role " + finalRoleType + " not found."));

        Department department = null;
        if (dto.getDepartmentId() != null) {
            department = departmentRepository.findById(dto.getDepartmentId()).orElse(null);
        }
        if (department == null) {
            List<Department> depts = departmentRepository.findByCompanyIdAndIsActiveTrue(company.getId());
            if (!depts.isEmpty()) {
                department = depts.get(0);
            }
        }

        User user = new User();
        user.setCompany(company);
        user.setEmail(email);
        String rawPassword = dto.getPassword();
        com.kuwy.helpdesk.util.PasswordPolicy.validate(rawPassword);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        user.setFirstName(dto.getFirstName());
        user.setLastName(dto.getLastName());
        user.setDisplayName(dto.getFirstName() + " " + (dto.getLastName() != null ? dto.getLastName() : "") + " (" + role.getName() + ")");
        user.setPhone(dto.getPhone());
        user.setRole(role);
        user.setPrimaryDepartment(department);
        user.setIsActive(true);

        return userRepository.save(user);
    }

    @Transactional
    public User toggleUserActive(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        user.setIsActive(!Boolean.TRUE.equals(user.getIsActive()));
        return userRepository.save(user);
    }

    @Transactional
    public void resetUserPassword(Long userId, String newPassword) {
        com.kuwy.helpdesk.util.PasswordPolicy.validate(newPassword);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.invalidateAuthentication();
        userRepository.save(user);
    }

    @Getter
    @Setter
    public static class CompanyDetailDto {
        private Long id;
        private String companyCode;
        private String name;
        private String subdomain;
        private String customDomain;
        private String status;
        private String planName;
        private Integer maxAgents;
        private String primaryColor;
        private LocalDateTime createdAt;
        private long userCount;
        private long ticketCount;
    }


    // =========================================================================
    // SECTION F: SUPER ADMIN METHODS (SCREENS 40 TO 43)
    // =========================================================================

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getPlatformPlans() {
        List<Map<String, Object>> plans = new ArrayList<>();

        Map<String, Object> free = new HashMap<>();
        free.put("code", "FREE");
        free.put("name", "Community Free");
        free.put("status", "PUBLIC");
        free.put("priceMonthlyInr", 0);
        free.put("priceYearlyInr", 0);
        free.put("maxAgents", 2);
        free.put("monthlyTickets", 100);
        free.put("customDomain", false);
        free.put("slaEngine", false);
        free.put("companiesCount", 1);
        plans.add(free);

        Map<String, Object> starter = new HashMap<>();
        starter.put("code", "STARTER");
        starter.put("name", "Growth Starter");
        starter.put("status", "PUBLIC");
        starter.put("priceMonthlyInr", 2999);
        starter.put("priceYearlyInr", 29990);
        starter.put("maxAgents", 5);
        starter.put("monthlyTickets", 1000);
        starter.put("customDomain", true);
        starter.put("slaEngine", true);
        starter.put("companiesCount", 2);
        plans.add(starter);

        Map<String, Object> pro = new HashMap<>();
        pro.put("code", "PRO");
        pro.put("name", "Scale Professional");
        pro.put("status", "PUBLIC");
        pro.put("priceMonthlyInr", 6999);
        pro.put("priceYearlyInr", 69990);
        pro.put("maxAgents", 15);
        pro.put("monthlyTickets", 5000);
        pro.put("customDomain", true);
        pro.put("slaEngine", true);
        pro.put("companiesCount", 1);
        plans.add(pro);

        Map<String, Object> enterprise = new HashMap<>();
        enterprise.put("code", "ENTERPRISE");
        enterprise.put("name", "Corporate Enterprise");
        enterprise.put("status", "PUBLIC");
        enterprise.put("priceMonthlyInr", 14999);
        enterprise.put("priceYearlyInr", 149990);
        enterprise.put("maxAgents", 50);
        enterprise.put("monthlyTickets", 50000);
        enterprise.put("customDomain", true);
        enterprise.put("slaEngine", true);
        enterprise.put("companiesCount", 2);
        plans.add(enterprise);

        return plans;
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> getCoupons() {
        List<Map<String, Object>> list = new ArrayList<>();

        Map<String, Object> c1 = new HashMap<>();
        c1.put("code", "STARTUP50");
        c1.put("discountPercent", 50);
        c1.put("duration", "3_MONTHS");
        c1.put("redemptionCount", 14);
        c1.put("maxRedemptions", 50);
        c1.put("isActive", true);
        list.add(c1);

        Map<String, Object> c2 = new HashMap<>();
        c2.put("code", "KUWYPROMO");
        c2.put("discountPercent", 20);
        c2.put("duration", "FOREVER");
        c2.put("redemptionCount", 8);
        c2.put("maxRedemptions", 100);
        c2.put("isActive", true);
        list.add(c2);

        return list;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getEmailSystemHealth() {
        Map<String, Object> health = new HashMap<>();
        health.put("inboundMessagesPerHour", 148);
        health.put("inboundQueueSize", 2);
        health.put("inboundProcessingDelayMs", 340);
        health.put("spfDkimPassRate", 99.4);
        health.put("outboundSentToday", 2840);
        health.put("outboundDeliveryRate", 99.8);
        health.put("bounceRate", 0.18);
        health.put("spamComplaintRate", 0.01);
        health.put("connectedMailboxesHealthy", 6);
        health.put("connectedMailboxesExpiring", 0);
        health.put("backgroundJobsRunning", 4);
        health.put("backgroundJobsWaiting", 0);
        health.put("backgroundJobsFailed", 0);
        health.put("deadLetterCount", 0);
        return health;
    }

    @Transactional
    public Company extendCompanyTrial(Long companyId, int extraDays, String reason) {
        Company comp = companyRepository.findById(companyId)
            .orElseThrow(() -> new RuntimeException("Company not found: " + companyId));
        comp.setStatus(Company.CompanyStatus.TRIAL);
        return companyRepository.save(comp);
    }

    @Transactional
    public Company suspendCompany(Long companyId, String reason) {
        Company comp = companyRepository.findById(companyId)
            .orElseThrow(() -> new RuntimeException("Company not found: " + companyId));
        comp.setStatus(Company.CompanyStatus.SUSPENDED);
        return companyRepository.save(comp);
    }

    public Map<String, Object> startSupportSession(Long companyId, String staffName, String reason) {
        Company comp = companyRepository.findById(companyId)
            .orElseThrow(() -> new RuntimeException("Company not found: " + companyId));
        Map<String, Object> session = new HashMap<>();
        session.put("companyId", comp.getId());
        session.put("companyName", comp.getName());
        session.put("subdomain", comp.getSubdomain());
        session.put("staffName", staffName);
        session.put("reason", reason);
        session.put("expiresAt", LocalDateTime.now().plusMinutes(60).toString());
        session.put("readOnly", true);
        session.put("sessionToken", "support-sess-" + comp.getSubdomain() + "-" + System.currentTimeMillis());
        return session;
    }

    @Transactional
    public void softDeleteCompany(Long companyId, String confirmationName) {
        Company comp = companyRepository.findById(companyId)
            .orElseThrow(() -> new RuntimeException("Company not found: " + companyId));
        if (!comp.getName().equalsIgnoreCase(confirmationName.trim())) {
            throw new IllegalArgumentException("Confirmation name '" + confirmationName + "' does not match company name '" + comp.getName() + "'");
        }
        comp.setStatus(Company.CompanyStatus.INACTIVE);
        companyRepository.save(comp);
    }

}

