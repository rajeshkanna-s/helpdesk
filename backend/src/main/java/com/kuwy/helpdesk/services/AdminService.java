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

        return AdminOverviewDto.builder()
                .totalCompanies(totalCompanies)
                .activeCompanies(activeCompanies)
                .suspendedCompanies(suspendedCompanies)
                .totalTickets(totalTickets)
                .totalAgents(totalAgents)
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
            String rawPassword = (dto.getAdminPassword() != null && !dto.getAdminPassword().isBlank())
                    ? dto.getAdminPassword() : "Password@123";
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
        String rawPassword = (dto.getPassword() != null && !dto.getPassword().isBlank()) ? dto.getPassword() : "Password@123";
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
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        user.setPasswordHash(passwordEncoder.encode(newPassword));
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
}
