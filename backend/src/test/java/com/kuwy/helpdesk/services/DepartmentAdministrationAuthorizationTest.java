package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.DepartmentCreateDto;
import com.kuwy.helpdesk.dto.SupportEngineerCreateDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

class DepartmentAdministrationAuthorizationTest {
    private UserRepository users;
    private DepartmentRepository departments;
    private CompanyRepository companies;
    private RoleRepository roles;
    private TicketRepository tickets;
    private SubscriptionService subscription;
    private EntityManager entityManager;
    private DepartmentService departmentService;
    private SupportEngineerService engineerService;
    private Company company;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        TenantContext.setContext(7L, 44L, "COMPANY_ADMIN", "admin@example.invalid");
        users = mock(UserRepository.class);
        departments = mock(DepartmentRepository.class);
        companies = mock(CompanyRepository.class);
        roles = mock(RoleRepository.class);
        tickets = mock(TicketRepository.class);
        subscription = mock(SubscriptionService.class);
        entityManager = mock(EntityManager.class);
        PasswordEncoder encoder = mock(PasswordEncoder.class);
        when(encoder.encode(anyString())).thenReturn("encoded-test-password");
        departmentService = new DepartmentService(departments, companies, users, tickets);
        engineerService = new SupportEngineerService(users, departments, companies, roles, tickets, encoder,
                subscription, entityManager);
        company = company(7L);
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(users.save(any(User.class))).thenAnswer(call -> call.getArgument(0));
        when(departments.save(any(Department.class))).thenAnswer(call -> call.getArgument(0));
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @Test
    void agentsCanReadDepartmentsAndEngineersButCannotCreateOrToggleThem() {
        TenantContext.setContext(7L, 44L, "AGENT", "agent@example.invalid");
        Department department = department(17L, company);
        User user = user(55L, company, Role.RoleType.AGENT, true);
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        when(users.findById(55L)).thenReturn(Optional.of(user));
        DepartmentCreateDto departmentDto = new DepartmentCreateDto();
        departmentDto.setCompanyId(7L);

        assertDoesNotThrow(() -> departmentService.getDepartmentsWithDetails(7L));
        assertDoesNotThrow(() -> engineerService.getEngineersByCategory(7L));
        assertThrows(SecurityException.class, () -> departmentService.createDepartment(departmentDto));
        assertThrows(SecurityException.class, () -> departmentService.toggleDepartmentActive(17L));
        assertThrows(SecurityException.class, () -> engineerService.createSupportEngineer(engineerRequest()));
        assertThrows(SecurityException.class, () -> engineerService.toggleEngineerActive(55L));
        assertTrue(department.getIsActive());
        assertTrue(user.getIsActive());
        verify(departments, never()).save(any());
        verify(users, never()).save(any());
        verifyNoInteractions(subscription, entityManager);
    }

    @Test
    void foreignDepartmentAndUserTogglesAreRejectedBeforeMutation() {
        Company foreignCompany = company(8L);
        Department department = department(17L, foreignCompany);
        User user = user(55L, foreignCompany, Role.RoleType.AGENT, true);
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        when(users.findById(55L)).thenReturn(Optional.of(user));
        assertThrows(SecurityException.class, () -> departmentService.toggleDepartmentActive(17L));
        assertThrows(SecurityException.class, () -> engineerService.toggleEngineerActive(55L));
        assertTrue(department.getIsActive());
        assertTrue(user.getIsActive());
        verify(departments, never()).save(any());
        verify(users, never()).save(any());
        verifyNoInteractions(subscription, entityManager);
    }

    @Test
    void companyAdminCanToggleOwnDepartment() {
        Department department = department(17L, company);
        when(departments.findById(17L)).thenReturn(Optional.of(department));
        assertFalse(departmentService.toggleDepartmentActive(17L).getIsActive());
        verify(departments).save(department);
    }

    @Test
    void lastActiveCompanyAdminCannotBeDisabled() {
        User admin = user(44L, company, Role.RoleType.COMPANY_ADMIN, true);
        when(users.findById(44L)).thenReturn(Optional.of(admin));
        when(users.findByCompanyIdAndIsActiveTrue(7L)).thenReturn(List.of(admin));

        assertThrows(IllegalStateException.class, () -> engineerService.toggleEngineerActive(44L));
        assertTrue(admin.getIsActive());
        verify(entityManager).lock(company, LockModeType.PESSIMISTIC_WRITE);
        verify(entityManager).refresh(admin);
        verify(users, never()).save(any());
    }

    @Test
    void anotherActiveAdminAllowsDisableAndInvalidatesOldAuthentication() {
        User admin = user(44L, company, Role.RoleType.COMPANY_ADMIN, true);
        User otherAdmin = user(55L, company, Role.RoleType.COMPANY_ADMIN, true);
        when(users.findById(44L)).thenReturn(Optional.of(admin));
        when(users.findByCompanyIdAndIsActiveTrue(7L)).thenReturn(List.of(admin, otherAdmin));

        User result = engineerService.toggleEngineerActive(44L);
        assertFalse(result.getIsActive());
        assertEquals("INACTIVE", result.getStatus());
        assertEquals(1L, result.getAuthVersion());
        verify(users).save(admin);
        verifyNoInteractions(subscription);
    }

    @Test
    void reactivationChecksSubscriptionBeforeChangingState() {
        User inactive = user(55L, company, Role.RoleType.AGENT, false);
        when(users.findById(55L)).thenReturn(Optional.of(inactive));
        doThrow(new IllegalStateException("Synthetic seat limit")).when(subscription).assertCanAddAgent(7L);

        assertThrows(IllegalStateException.class, () -> engineerService.toggleEngineerActive(55L));
        assertFalse(inactive.getIsActive());
        assertEquals("INACTIVE", inactive.getStatus());
        verify(users, never()).save(any());
        verify(entityManager).lock(company, LockModeType.PESSIMISTIC_WRITE);
    }

    @Test
    void companySeatLimitAlsoAppliesWhenReactivating() {
        User inactive = user(55L, company, Role.RoleType.AGENT, false);
        company.setMaxAgents(2);
        when(users.findById(55L)).thenReturn(Optional.of(inactive));
        when(users.countByCompanyIdAndIsActiveTrue(7L)).thenReturn(2L);
        assertThrows(IllegalStateException.class, () -> engineerService.toggleEngineerActive(55L));
        assertFalse(inactive.getIsActive());
        verify(subscription).assertCanAddAgent(7L);
        verify(users, never()).save(any());
    }

    @Test
    void reactivationWithAvailableSeatPersistsAndInvalidatesOldAuthentication() {
        User inactive = user(55L, company, Role.RoleType.AGENT, false);
        when(users.findById(55L)).thenReturn(Optional.of(inactive));
        User result = engineerService.toggleEngineerActive(55L);
        assertTrue(result.getIsActive());
        assertEquals("ACTIVE", result.getStatus());
        assertEquals(1L, result.getAuthVersion());
        verify(subscription).assertCanAddAgent(7L);
        verify(users).save(inactive);
    }

    @Test
    void engineerCreationRejectsForeignDepartmentsAndRoles() {
        Department foreign = department(17L, company(8L));
        when(departments.findById(17L)).thenReturn(Optional.of(foreign));
        SupportEngineerCreateDto dto = engineerRequest();
        dto.setDepartmentId(17L);
        assertThrows(SecurityException.class, () -> engineerService.createSupportEngineer(dto));
        verify(users, never()).save(any());

        dto.setDepartmentId(null);
        Role foreignRole = role(company(8L), Role.RoleType.AGENT);
        foreignRole.setIsSystemRole(true);
        when(roles.findByCompanyIdOrIsSystemRoleTrue(7L)).thenReturn(List.of(foreignRole));
        assertThrows(RuntimeException.class, () -> engineerService.createSupportEngineer(dto));
        verify(users, never()).save(any());
    }

    @Test
    void validEngineerCreationUsesTenantRoleAndChecksSeatsInService() {
        Role role = role(company, Role.RoleType.AGENT);
        when(roles.findByCompanyIdAndRoleType(7L, Role.RoleType.AGENT)).thenReturn(Optional.of(role));
        assertEquals(7L, engineerService.createSupportEngineer(engineerRequest()).getCompanyId());
        verify(subscription).assertCanAddAgent(7L);
        verify(entityManager).lock(company, LockModeType.PESSIMISTIC_WRITE);
        verify(users).save(argThat(user -> user.getCompany() == company && user.getRole() == role));
    }

    private SupportEngineerCreateDto engineerRequest() {
        SupportEngineerCreateDto dto = new SupportEngineerCreateDto();
        dto.setCompanyId(7L);
        dto.setFirstName("Synthetic");
        dto.setLastName("Engineer");
        dto.setEmail("engineer@example.invalid");
        dto.setPassword("test-only-password");
        dto.setRoleType("AGENT");
        return dto;
    }

    private Company company(Long id) {
        Company value = new Company();
        value.setId(id);
        value.setMaxAgents(10);
        return value;
    }

    private Department department(Long id, Company owner) {
        Department value = new Department();
        value.setId(id);
        value.setCompany(owner);
        value.setIsActive(true);
        return value;
    }

    private Role role(Company owner, Role.RoleType type) {
        Role value = new Role();
        value.setCompany(owner);
        value.setRoleType(type);
        value.setName(type.name());
        return value;
    }

    private User user(Long id, Company owner, Role.RoleType type, boolean active) {
        User value = new User();
        value.setId(id);
        value.setCompany(owner);
        value.setRole(role(owner, type));
        value.setIsActive(active);
        value.setStatus(active ? "ACTIVE" : "INACTIVE");
        return value;
    }
}
