package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.SupportEngineerCreateDto;
import com.kuwy.helpdesk.dto.SupportEngineerDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SupportEngineerService {

    private final UserRepository userRepository;
    private final DepartmentRepository departmentRepository;
    private final CompanyRepository companyRepository;
    private final RoleRepository roleRepository;
    private final TicketRepository ticketRepository;
    private final PasswordEncoder passwordEncoder;
    private final SubscriptionService subscriptionService;
    private final EntityManager entityManager;

    @Transactional(readOnly = true)
    public List<SupportEngineerDto> getEngineersByCategory(Long companyId) {
        TenantContext.assertAccessTo(companyId);
        List<User> users = userRepository.findByCompanyId(companyId);
        List<Ticket> allTickets = ticketRepository.findAll().stream()
                .filter(t -> t.getCompany().getId().equals(companyId))
                .collect(Collectors.toList());

        return users.stream().map(u -> {
            long activeTickets = allTickets.stream()
                    .filter(t -> t.getAssignedAgent() != null && t.getAssignedAgent().getId().equals(u.getId()))
                    .filter(t -> t.getStatus() != Ticket.TicketStatus.RESOLVED && t.getStatus() != Ticket.TicketStatus.CLOSED)
                    .count();

            Department d = u.getPrimaryDepartment();

            return SupportEngineerDto.builder()
                    .id(u.getId())
                    .companyId(u.getCompany().getId())
                    .companyCode(u.getCompany().getCompanyCode())
                    .departmentId(d != null ? d.getId() : null)
                    .departmentName(d != null ? d.getName() : "Unassigned Category")
                    .departmentCode(d != null ? d.getCode() : "GEN")
                    .firstName(u.getFirstName())
                    .lastName(u.getLastName())
                    .displayName(u.getDisplayName())
                    .email(u.getEmail())
                    .phone(u.getPhone())
                    .roleType(u.getRole() != null ? u.getRole().getRoleType().name() : "AGENT")
                    .roleName(u.getRole() != null ? u.getRole().getName() : "Support Engineer")
                    .isActive(Boolean.TRUE.equals(u.getIsActive()))
                    .activeTicketsCount(activeTickets)
                    .createdAt(u.getCreatedAt())
                    .build();
        }).collect(Collectors.toList());
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public SupportEngineerDto createSupportEngineer(SupportEngineerCreateDto dto) {
        TenantContext.assertCompanyAdminAccessTo(dto.getCompanyId());
        Company company = companyRepository.findById(dto.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Company not found: " + dto.getCompanyId()));
        // Serialize seat changes and last-admin checks within this tenant.
        entityManager.lock(company, LockModeType.PESSIMISTIC_WRITE);
        assertSeatAvailable(company);

        Department dept = null;
        if (dto.getDepartmentId() != null) {
            dept = departmentRepository.findById(dto.getDepartmentId())
                    .filter(d -> d.getCompany() != null && company.getId().equals(d.getCompany().getId()))
                    .orElseThrow(() -> new SecurityException("Department not found in this workspace."));
        }

        Role.RoleType targetRoleType = "COMPANY_ADMIN".equalsIgnoreCase(dto.getRoleType())
                ? Role.RoleType.COMPANY_ADMIN
                : Role.RoleType.AGENT;

        Role role = roleRepository.findByCompanyIdAndRoleType(company.getId(), targetRoleType)
                .filter(r -> r.getCompany() != null && company.getId().equals(r.getCompany().getId()))
                .or(() -> roleRepository.findByCompanyIdOrIsSystemRoleTrue(company.getId()).stream()
                        .filter(r -> r.getRoleType() == targetRoleType && r.getCompany() == null && Boolean.TRUE.equals(r.getIsSystemRole()))
                        .findFirst())
                .orElseThrow(() -> new RuntimeException("Role not found for " + targetRoleType));

        String categoryLabel = (dept != null && dept.getCode() != null) ? dept.getCode() : "Support";
        String displayName = dto.getFirstName() + " " + (dto.getLastName() != null ? dto.getLastName() : "");
        displayName = displayName.trim() + " (" + categoryLabel + " Support Engineer)";

        User user = new User();
        user.setCompany(company);
        user.setEmail(dto.getEmail().trim().toLowerCase());
        user.setPasswordHash(passwordEncoder.encode(dto.getPassword() != null && !dto.getPassword().isBlank() ? dto.getPassword() : "Password@123"));
        user.setFirstName(dto.getFirstName());
        user.setLastName(dto.getLastName());
        user.setDisplayName(displayName);
        user.setPhone(dto.getPhone());
        user.setPrimaryDepartment(dept);
        user.setRole(role);
        user.setIsActive(true);

        User saved = userRepository.save(user);

        return SupportEngineerDto.builder()
                .id(saved.getId())
                .companyId(company.getId())
                .companyCode(company.getCompanyCode())
                .departmentId(dept != null ? dept.getId() : null)
                .departmentName(dept != null ? dept.getName() : "General Support")
                .departmentCode(dept != null ? dept.getCode() : "GEN")
                .firstName(saved.getFirstName())
                .lastName(saved.getLastName())
                .displayName(saved.getDisplayName())
                .email(saved.getEmail())
                .phone(saved.getPhone())
                .roleType(saved.getRole().getRoleType().name())
                .roleName(saved.getRole().getName())
                .isActive(Boolean.TRUE.equals(saved.getIsActive()))
                .activeTicketsCount(0)
                .createdAt(saved.getCreatedAt())
                .build();
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public User toggleEngineerActive(Long userId) {
        TenantContext.requireUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found: " + userId));
        Company company = user.getCompany();
        TenantContext.assertCompanyAdminAccessTo(company != null ? company.getId() : null);
        entityManager.lock(company, LockModeType.PESSIMISTIC_WRITE);
        entityManager.refresh(user);
        if (user.getCompany() == null || !company.getId().equals(user.getCompany().getId())
                || user.getRole() == null || user.getRole().getRoleType() == null
                || user.getRole().getRoleType() == Role.RoleType.SUPER_ADMIN
                || user.getRole().getRoleType() == Role.RoleType.CUSTOMER) {
            throw new SecurityException("Only staff belonging to this workspace can be managed here.");
        }
        boolean active = Boolean.TRUE.equals(user.getIsActive());
        if (active && user.getRole().getRoleType() == Role.RoleType.COMPANY_ADMIN) {
            long activeAdmins = userRepository.findByCompanyIdAndIsActiveTrue(company.getId()).stream()
                    .filter(u -> u.getRole() != null && u.getRole().getRoleType() == Role.RoleType.COMPANY_ADMIN)
                    .count();
            if (activeAdmins <= 1) {
                throw new IllegalStateException("The last active company administrator cannot be disabled.");
            }
        }
        if (!active) {
            assertSeatAvailable(company);
        }
        user.setIsActive(!active);
        return userRepository.save(user);
    }

    private void assertSeatAvailable(Company company) {
        subscriptionService.assertCanAddAgent(company.getId());
        if (company.getMaxAgents() != null
                && userRepository.countByCompanyIdAndIsActiveTrue(company.getId()) >= company.getMaxAgents()) {
            throw new IllegalStateException("The workspace has reached its support agent seat limit.");
        }
    }
}
