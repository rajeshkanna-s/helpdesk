package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.BulkUpdateDto;
import com.kuwy.helpdesk.dto.ScenarioExecuteDto;
import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.TicketReplyDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.models.CustomerAccount;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketThread;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.ContactRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.TicketAttachmentRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.TicketThreadRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.stream.LongStream;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class TicketServiceAuthorizationTest {

    private TicketRepository tickets;
    private TicketThreadRepository threads;
    private CompanyRepository companies;
    private DepartmentRepository departments;
    private ContactRepository contacts;
    private UserRepository users;
    private TicketAttachmentRepository attachments;
    private TicketService service;
    private Company company;
    private Company foreignCompany;
    private Department department;
    private User actor;
    private Ticket ticket;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        tickets = mock(TicketRepository.class);
        threads = mock(TicketThreadRepository.class);
        companies = mock(CompanyRepository.class);
        departments = mock(DepartmentRepository.class);
        contacts = mock(ContactRepository.class);
        users = mock(UserRepository.class);
        attachments = mock(TicketAttachmentRepository.class);
        service = new TicketService(tickets, threads, companies, departments, contacts, users, attachments);
        company = company(7L);
        foreignCompany = company(8L);
        department = department(20L, company);
        actor = user(11L, company, Role.RoleType.AGENT);
        ticket = ticket(41L, company);
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "detail", "threads", "create", "reply", "status", "priority", "department", "assign", "bulk", "scenario"})
    void everyOperationRejectsAbsentIdentityIncludingTenantOnlyContext(String operation) {
        assertThrows(SecurityException.class, () -> invoke(operation));
        TenantContext.setCompanyId(company.getId());
        assertThrows(SecurityException.class, () -> invoke(operation));
        verifyNoInteractions(tickets, threads, companies, departments, contacts, users, attachments);
    }

    @ParameterizedTest
    @ValueSource(strings = {"deleted", "disabled", "inactive-status", "missing-status", "invited", "missing-role", "customer", "stale-role", "foreign-user", "foreign-role", "stale-email"})
    void invalidCurrentDbActorCannotUseAnyTicketOperation(String reason) {
        authenticate(Role.RoleType.AGENT);
        switch (reason) {
            case "deleted" -> when(users.findById(actor.getId())).thenReturn(Optional.empty());
            case "disabled" -> actor.setIsActive(false);
            case "inactive-status" -> actor.setStatus("DISABLED");
            case "missing-status" -> actor.setStatus(null);
            case "invited" -> actor.setStatus("INVITED");
            case "missing-role" -> actor.setRole(null);
            case "customer" -> actor.getRole().setRoleType(Role.RoleType.CUSTOMER);
            case "stale-role" -> TenantContext.setContext(7L, 11L, "SUPER_ADMIN", actor.getEmail());
            case "foreign-user" -> actor.setCompany(foreignCompany);
            case "foreign-role" -> actor.getRole().setCompany(foreignCompany);
            case "stale-email" -> actor.setEmail("changed@example.invalid");
            default -> fail("Unknown fixture");
        }

        for (String operation : List.of("list", "detail", "threads", "create", "reply", "status", "priority", "department", "assign", "bulk", "scenario")) {
            assertThrows(SecurityException.class, () -> invoke(operation), operation);
        }
        verifyNoInteractions(tickets, threads, companies, departments, contacts, attachments);
    }

    @ParameterizedTest
    @ValueSource(strings = {"create", "reply", "status", "priority", "department", "assign", "bulk", "scenario"})
    void lightAgentsCannotMutateEvenThroughBulkOrMacros(String operation) {
        authenticate(Role.RoleType.LIGHT_AGENT);
        assertThrows(SecurityException.class, () -> invoke(operation));
        verifyNoInteractions(tickets, threads, companies, departments, contacts, attachments);
    }

    @ParameterizedTest
    @EnumSource(value = Role.RoleType.class, names = {"AGENT", "TEAM_LEAD", "COMPANY_ADMIN", "LIGHT_AGENT", "SUPER_ADMIN"})
    void staffCanReadTheirTenantAndBothPublicAndPrivateThreads(Role.RoleType role) {
        authenticate(role);
        stubTicket();
        TicketThread publicReply = thread(51L, false);
        TicketThread privateNote = thread(52L, true);
        when(threads.findByTicketIdOrderByCreatedAtAsc(41L)).thenReturn(List.of(publicReply, privateNote));
        PageRequest page = PageRequest.of(0, 25, Sort.by("createdAt"));
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(tickets.findByCompanyId(7L, page)).thenReturn(new PageImpl<>(List.of(ticket), page, 1));

        assertEquals(List.of(ticket), service.getCompanyTickets(null, null, null, page).getContent());
        assertSame(ticket, service.getTicketById(41L));
        assertEquals(List.of(publicReply, privateNote), ticket.getThreads());
        assertEquals(List.of(publicReply, privateNote), service.getTicketThreads(41L));
        assertTrue(privateNote.getIsPrivate());
        verify(tickets).findByCompanyId(7L, page);
        verifyNoWrites();
    }

    @ParameterizedTest
    @ValueSource(strings = {"list", "detail", "threads", "create", "reply", "status", "priority", "department", "assign", "bulk", "scenario"})
    void everyOperationRejectsForeignTicketOrRequestedCompany(String operation) {
        authenticate(Role.RoleType.AGENT);
        ticket = ticket(41L, foreignCompany);
        stubTicket();
        when(tickets.findAllById(List.of(41L))).thenReturn(List.of(ticket));
        if ("list".equals(operation)) {
            assertThrows(SecurityException.class, () -> service.getCompanyTickets(8L, null, null, PageRequest.of(0, 25)));
        } else if ("create".equals(operation)) {
            TicketCreateDto dto = createRequest();
            dto.setCompanyId(8L);
            assertThrows(SecurityException.class, () -> service.createTicket(dto));
        } else {
            assertThrows(SecurityException.class, () -> invoke(operation));
        }
        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        verifyNoInteractions(threads, attachments, departments, contacts, companies);
        verifyNoWrites();
    }

    @ParameterizedTest
    @ValueSource(strings = {"department", "assignee", "contact", "account"})
    void detailRejectsPreviouslyLinkedForeignRecordsBeforeReadingThreads(String relation) {
        authenticate(Role.RoleType.AGENT);
        stubTicket();
        switch (relation) {
            case "department" -> ticket.setDepartment(department(20L, foreignCompany));
            case "assignee" -> ticket.setAssignedAgent(user(22L, foreignCompany, Role.RoleType.AGENT));
            case "contact" -> ticket.getContact().setCompany(foreignCompany);
            case "account" -> ticket.getContact().setAccount(account(foreignCompany));
            default -> fail("Unknown fixture");
        }
        assertThrows(SecurityException.class, () -> service.getTicketById(41L));
        verifyNoInteractions(threads, attachments);
    }

    @Test
    void threadReadsRejectAnUnexpectedForeignThreadBeforeAttachmentLoading() {
        authenticate(Role.RoleType.AGENT);
        stubTicket();
        TicketThread foreignThread = thread(51L, true);
        foreignThread.setCompany(foreignCompany);
        when(threads.findByTicketIdOrderByCreatedAtAsc(41L)).thenReturn(List.of(foreignThread));
        assertThrows(SecurityException.class, () -> service.getTicketThreads(41L));
        verifyNoInteractions(attachments);
    }

    @ParameterizedTest
    @EnumSource(value = Company.CompanyStatus.class, names = {"INACTIVE", "SUSPENDED"})
    void inactiveTargetWorkspaceIsRejectedEvenForSuperAdmin(Company.CompanyStatus status) {
        authenticate(Role.RoleType.SUPER_ADMIN);
        ticket = ticket(41L, foreignCompany);
        foreignCompany.setStatus(status);
        stubTicket();
        assertThrows(SecurityException.class, () -> service.updateStatus(41L, Ticket.TicketStatus.RESOLVED));
        verifyNoWrites();
    }

    @Test
    void superAdminCanReadAndBulkUpdateOneExplicitOtherTenant() {
        authenticate(Role.RoleType.SUPER_ADMIN);
        ticket = ticket(41L, foreignCompany);
        Ticket second = ticket(42L, foreignCompany);
        stubTicket();
        when(tickets.findAllById(List.of(41L, 42L))).thenReturn(List.of(ticket, second));

        assertSame(ticket, service.getTicketById(41L));
        service.bulkUpdate(bulkRequest(41L, 42L));

        assertEquals(Ticket.TicketStatus.RESOLVED, ticket.getStatus());
        assertEquals(Ticket.TicketStatus.RESOLVED, second.getStatus());
        verify(tickets).saveAll(List.of(ticket, second));
    }

    @Test
    void superAdminWithoutATargetCannotFallBackToCompanyOne() {
        authenticate(Role.RoleType.SUPER_ADMIN);
        TenantContext.setContext(null, actor.getId(), "SUPER_ADMIN", actor.getEmail());
        TicketCreateDto dto = createRequest();
        dto.setCompanyId(null);

        assertThrows(IllegalArgumentException.class, () -> service.getCompanyTickets(null, null, null, PageRequest.of(0, 25)));
        assertThrows(IllegalArgumentException.class, () -> service.createTicket(dto));
        verifyNoInteractions(companies, departments, contacts, tickets, threads);
    }

    @ParameterizedTest
    @MethodSource("invalidPages")
    void listRejectsUnboundedPagesAndUnapprovedSortFields(Pageable pageable) {
        authenticate(Role.RoleType.AGENT);
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        assertThrows(IllegalArgumentException.class, () -> service.getCompanyTickets(7L, null, null, pageable));
        verifyNoInteractions(tickets);
    }

    static Stream<Pageable> invalidPages() {
        return Stream.of(Pageable.unpaged(), PageRequest.of(0, 101), PageRequest.of(100_001, 25),
                PageRequest.of(0, 25, Sort.by("company.settingsJson")));
    }

    @ParameterizedTest
    @MethodSource("invalidAssignments")
    void everyAssigneeEntryPointRejectsForeignOrIneligibleTargetsWithoutSaving(String operation, String reason) {
        authenticate(Role.RoleType.AGENT);
        stubCreateReferences();
        stubTicket();
        when(tickets.findAllById(List.of(41L))).thenReturn(List.of(ticket));
        User target = user(22L, company, Role.RoleType.AGENT);
        switch (reason) {
            case "foreign" -> target.setCompany(foreignCompany);
            case "disabled" -> target.setIsActive(false);
            case "missing-active" -> target.setIsActive(null);
            case "invited" -> target.setStatus("INVITED");
            case "customer" -> target.getRole().setRoleType(Role.RoleType.CUSTOMER);
            case "light" -> target.getRole().setRoleType(Role.RoleType.LIGHT_AGENT);
            case "platform" -> target.getRole().setRoleType(Role.RoleType.SUPER_ADMIN);
            case "missing-role" -> target.setRole(null);
            case "foreign-role" -> target.getRole().setCompany(foreignCompany);
            case "missing" -> { }
            default -> fail("Unknown fixture");
        }
        when(users.findById(22L)).thenReturn("missing".equals(reason) ? Optional.empty() : Optional.of(target));
        Class<? extends RuntimeException> error = "foreign".equals(reason) ? SecurityException.class : IllegalArgumentException.class;

        assertThrows(error, () -> {
            switch (operation) {
                case "create" -> {
                    TicketCreateDto dto = createRequest();
                    dto.setAssignedAgentId(22L);
                    service.createTicket(dto);
                }
                case "assign" -> service.assignAgent(41L, 22L);
                case "bulk" -> {
                    BulkUpdateDto dto = bulkRequest(41L);
                    dto.setAgentId(22L);
                    service.bulkUpdate(dto);
                }
                case "filter" -> service.getCompanyTickets(7L, "OPEN", 22L, PageRequest.of(0, 25));
                default -> fail("Unknown operation");
            }
        });
        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        assertNull(ticket.getAssignedAgent());
        verifyNoWrites();
    }

    static Stream<Arguments> invalidAssignments() {
        return Stream.of("create", "assign", "bulk", "filter").flatMap(operation ->
                Stream.of("foreign", "disabled", "missing-active", "invited", "customer", "light", "platform", "missing-role", "foreign-role", "missing")
                        .map(reason -> Arguments.of(operation, reason)));
    }

    @ParameterizedTest
    @MethodSource("invalidDepartments")
    void replacementDepartmentsMustExistBeActiveAndOwnedBeforeAnySave(String operation, String reason) {
        authenticate(Role.RoleType.AGENT);
        stubCreateReferences();
        stubTicket();
        when(tickets.findAllById(List.of(41L))).thenReturn(List.of(ticket));
        Department target = department(23L, "foreign".equals(reason) ? foreignCompany : company);
        if ("inactive".equals(reason)) target.setIsActive(false);
        if ("missing-active".equals(reason)) target.setIsActive(null);
        when(departments.findById(23L)).thenReturn("missing".equals(reason) ? Optional.empty() : Optional.of(target));
        Class<? extends RuntimeException> error = "foreign".equals(reason) ? SecurityException.class : IllegalArgumentException.class;
        assertThrows(error, () -> {
            switch (operation) {
                case "create" -> {
                    TicketCreateDto dto = createRequest();
                    dto.setDepartmentId(23L);
                    service.createTicket(dto);
                }
                case "department" -> service.updateDepartment(41L, 23L);
                case "bulk" -> {
                    BulkUpdateDto dto = bulkRequest(41L);
                    dto.setDepartmentId(23L);
                    dto.setAgentId(22L);
                    when(users.findById(22L)).thenReturn(Optional.of(user(22L, company, Role.RoleType.AGENT)));
                    service.bulkUpdate(dto);
                }
                default -> fail("Unknown operation");
            }
        });
        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        assertNull(ticket.getResolvedAt());
        assertNull(ticket.getAssignedAgent());
        assertEquals(20L, ticket.getDepartment().getId());
        verifyNoWrites();
    }

    static Stream<Arguments> invalidDepartments() {
        return Stream.of("create", "department", "bulk").flatMap(operation ->
                Stream.of("foreign", "inactive", "missing-active", "missing").map(reason -> Arguments.of(operation, reason)));
    }

    @ParameterizedTest
    @ValueSource(strings = {"contact", "account"})
    void createRechecksOwnershipOfResolvedContactAndAccount(String relation) {
        authenticate(Role.RoleType.AGENT);
        stubCreateReferences();
        Contact contact = ticket.getContact();
        if ("contact".equals(relation)) contact.setCompany(foreignCompany);
        else contact.setAccount(account(foreignCompany));
        when(contacts.findByCompanyIdAndEmail(7L, "requester@example.invalid")).thenReturn(Optional.of(contact));
        assertThrows(SecurityException.class, () -> service.createTicket(createRequest()));
        verifyNoWrites();
    }

    @ParameterizedTest
    @ValueSource(strings = {"explicit", "auto", "unassigned"})
    void validCreatePreservesContractAndAutoAssignmentUsesOnlyEligibleTenantStaff(String assignment) {
        authenticate(Role.RoleType.AGENT);
        stubCreateReferences();
        User eligible = user(22L, company, Role.RoleType.AGENT);
        TicketCreateDto dto = createRequest();
        dto.setCompanyId(null);
        if ("explicit".equals(assignment)) {
            dto.setAssignedAgentId(22L);
            when(users.findById(22L)).thenReturn(Optional.of(eligible));
        } else {
            User disabled = user(23L, company, Role.RoleType.AGENT);
            disabled.setIsActive(false);
            User invited = user(24L, company, Role.RoleType.AGENT);
            invited.setStatus("INVITED");
            List<User> candidates = new java.util.ArrayList<>(List.of(disabled, invited,
                    user(25L, company, Role.RoleType.CUSTOMER), user(26L, company, Role.RoleType.LIGHT_AGENT),
                    user(27L, company, Role.RoleType.SUPER_ADMIN), user(28L, foreignCompany, Role.RoleType.AGENT)));
            if ("auto".equals(assignment)) candidates.add(eligible);
            when(users.findByCompanyIdAndIsActiveTrue(7L)).thenReturn(candidates);
        }
        when(tickets.findMaxTicketSequenceForCompany(7L)).thenReturn(1008L);
        when(contacts.save(any(Contact.class))).thenAnswer(call -> call.getArgument(0));
        when(tickets.save(any(Ticket.class))).thenAnswer(call -> call.getArgument(0));

        Ticket created = service.createTicket(dto);

        assertSame(company, created.getCompany());
        assertSame(department, created.getDepartment());
        assertEquals("T7-1009", created.getTicketNumber());
        assertEquals(Ticket.TicketStatus.OPEN, created.getStatus());
        assertEquals(Ticket.TicketPriority.MEDIUM, created.getPriority());
        assertEquals(Ticket.TicketChannel.WEB_PORTAL, created.getChannel());
        assertSame("unassigned".equals(assignment) ? null : eligible, created.getAssignedAgent());
        ArgumentCaptor<TicketThread> initial = ArgumentCaptor.forClass(TicketThread.class);
        verify(threads).save(initial.capture());
        assertSame(created, initial.getValue().getTicket());
        assertSame(created.getContact(), initial.getValue().getSenderContact());
        assertEquals(TicketThread.SenderType.CUSTOMER, initial.getValue().getSenderType());
        assertFalse(initial.getValue().getIsPrivate());
        verify(contacts).save(any(Contact.class));
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing-department", "invalid-company", "invalid-assignee", "email", "name", "subject", "blank-subject", "description"})
    void malformedCreateRequestsFailBeforeReferenceLookupsOrWrites(String field) {
        authenticate(Role.RoleType.AGENT);
        TicketCreateDto dto = createRequest();
        switch (field) {
            case "missing-department" -> dto.setDepartmentId(null);
            case "invalid-company" -> dto.setCompanyId(0L);
            case "invalid-assignee" -> dto.setAssignedAgentId(-1L);
            case "email" -> dto.setRequesterEmail("not-an-email");
            case "name" -> dto.setRequesterName("x".repeat(101));
            case "subject" -> dto.setSubject("x".repeat(501));
            case "blank-subject" -> dto.setSubject(" ");
            case "description" -> dto.setDescription("x".repeat(TicketCreateDto.MAX_BODY_LENGTH + 1));
            default -> fail("Unknown fixture");
        }
        assertThrows(IllegalArgumentException.class, () -> service.createTicket(dto));
        verifyNoInteractions(companies, departments, contacts, tickets, threads);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void replyIgnoresForgedUserNameAndEmailAndPreservesPrivacy(boolean privateNote) {
        authenticate(Role.RoleType.AGENT);
        stubTicket();
        TicketReplyDto dto = replyRequest();
        dto.setIsPrivate(privateNote);
        dto.setSenderUserId(999L);
        dto.setSenderName("Forged Platform Administrator");
        dto.setSenderEmail("forged@example.invalid");
        when(threads.save(any(TicketThread.class))).thenAnswer(call -> call.getArgument(0));

        TicketThread saved = service.addReply(41L, dto);

        assertSame(actor, saved.getSenderUser());
        assertEquals(actor.getDisplayName(), saved.getFromName());
        assertEquals(actor.getEmail(), saved.getFromEmail());
        assertEquals(TicketThread.SenderType.AGENT, saved.getSenderType());
        assertEquals(privateNote, saved.getIsPrivate());
        assertEquals(privateNote ? TicketThread.ThreadType.PRIVATE_NOTE : TicketThread.ThreadType.REPLY, saved.getThreadType());
        assertEquals(privateNote ? null : ticket.getContact().getEmail(), saved.getToEmails());
        assertEquals(privateNote ? Ticket.TicketStatus.OPEN : Ticket.TicketStatus.WAITING_ON_CUSTOMER, ticket.getStatus());
        if (privateNote) {
            assertNull(ticket.getFirstResponseAt());
            verify(tickets, never()).save(any());
        } else {
            assertNotNull(ticket.getFirstResponseAt());
            verify(tickets).save(ticket);
        }
        verify(users).findById(11L);
        verifyNoMoreInteractions(users);
    }

    @ParameterizedTest
    @MethodSource("invalidBodies")
    void invalidReplyBodyIsRejectedBeforeLoadingOrChangingATicket(String body) {
        authenticate(Role.RoleType.AGENT);
        TicketReplyDto dto = replyRequest();
        dto.setBody(body);
        assertThrows(IllegalArgumentException.class, () -> service.addReply(41L, dto));
        verifyNoInteractions(tickets, threads);
    }

    static Stream<String> invalidBodies() {
        return Stream.of(null, "", " \n", "x".repeat(TicketCreateDto.MAX_BODY_LENGTH + 1));
    }

    @ParameterizedTest
    @CsvSource({"KYC_RESUBMIT,false,WAITING_ON_CUSTOMER,HIGH", "ESCALATE_LEAD,true,IN_PROGRESS,URGENT",
            "LOAN_APPROVED,false,RESOLVED,MEDIUM", "CUSTOMER_INACTIVE,true,CLOSED,MEDIUM", "CUSTOM_NOTE,true,OPEN,MEDIUM"})
    void agentMacrosUseTheAuthenticatedAuthorWithoutChangingTheirRole(String key, boolean privateNote,
                                                                       Ticket.TicketStatus status, Ticket.TicketPriority priority) {
        authenticate(Role.RoleType.AGENT);
        stubTicket();
        when(tickets.save(ticket)).thenReturn(ticket);
        ScenarioExecuteDto dto = scenarioRequest();
        dto.setScenarioKey(key);
        dto.setAuthorName("Forged Administrator");
        dto.setCustomNote("Internal follow-up only");

        assertSame(ticket, service.executeScenario(41L, dto));

        ArgumentCaptor<TicketThread> saved = ArgumentCaptor.forClass(TicketThread.class);
        verify(threads).save(saved.capture());
        assertSame(actor, saved.getValue().getSenderUser());
        assertEquals(actor.getDisplayName(), saved.getValue().getFromName());
        assertEquals(actor.getEmail(), saved.getValue().getFromEmail());
        assertEquals(privateNote, saved.getValue().getIsPrivate());
        assertEquals(privateNote ? TicketThread.ThreadType.PRIVATE_NOTE : TicketThread.ThreadType.REPLY, saved.getValue().getThreadType());
        assertEquals(privateNote ? null : ticket.getContact().getEmail(), saved.getValue().getToEmails());
        assertEquals(status, ticket.getStatus());
        assertEquals(priority, ticket.getPriority());
        assertEquals(Role.RoleType.AGENT, actor.getRole().getRoleType());
        assertNull(ticket.getAssignedAgent());
        assertFalse(saved.getValue().getBodyText().contains("have been dispatched"));
        verify(users, never()).save(any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"KYC_RESUBMIT", "ESCALATE_LEAD", "LOAN_APPROVED", "CUSTOMER_INACTIVE", "CUSTOM_NOTE"})
    void lightAgentCannotUseAnyMacroOrPrivateNoteAsAWriteBypass(String key) {
        authenticate(Role.RoleType.LIGHT_AGENT);
        ScenarioExecuteDto dto = scenarioRequest();
        dto.setScenarioKey(key);
        dto.setCustomNote("Internal note");
        assertThrows(SecurityException.class, () -> service.executeScenario(41L, dto));
        TicketReplyDto reply = replyRequest();
        reply.setIsPrivate(true);
        assertThrows(SecurityException.class, () -> service.addReply(41L, reply));
        verifyNoInteractions(tickets, threads);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing-key", "long-key", "unknown-without-note", "oversized-note"})
    void malformedScenarioCannotPartiallyChangeTicket(String reason) {
        authenticate(Role.RoleType.AGENT);
        stubTicket();
        ScenarioExecuteDto dto = scenarioRequest();
        switch (reason) {
            case "missing-key" -> dto.setScenarioKey(null);
            case "long-key" -> dto.setScenarioKey("x".repeat(65));
            case "unknown-without-note" -> dto.setScenarioKey("UNKNOWN");
            case "oversized-note" -> dto.setCustomNote("x".repeat(TicketCreateDto.MAX_BODY_LENGTH + 1));
            default -> fail("Unknown fixture");
        }
        assertThrows(IllegalArgumentException.class, () -> service.executeScenario(41L, dto));
        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        assertEquals(Ticket.TicketPriority.MEDIUM, ticket.getPriority());
        verifyNoWrites();
    }

    @ParameterizedTest
    @EnumSource(value = Role.RoleType.class, names = {"AGENT", "SUPER_ADMIN"})
    void mixedTenantBulkIsRejectedWithoutMutatingTheFirstTicket(Role.RoleType role) {
        authenticate(role);
        Ticket second = ticket(42L, foreignCompany);
        when(tickets.findAllById(List.of(41L, 42L))).thenReturn(List.of(ticket, second));
        BulkUpdateDto dto = bulkRequest(41L, 42L);
        dto.setAgentId(22L);
        dto.setDepartmentId(23L);

        assertThrows(SecurityException.class, () -> service.bulkUpdate(dto));

        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        assertEquals(Ticket.TicketStatus.OPEN, second.getStatus());
        assertNull(ticket.getResolvedAt());
        assertNull(ticket.getAssignedAgent());
        verify(users, never()).findById(22L);
        verifyNoInteractions(departments);
        verifyNoWrites();
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "duplicate-result", "unexpected-result"})
    void bulkRequiresEveryRequestedIdExactlyOnceBeforeAnyMutation(String result) {
        authenticate(Role.RoleType.AGENT);
        List<Ticket> found = switch (result) {
            case "missing" -> List.of(ticket);
            case "duplicate-result" -> List.of(ticket, ticket);
            default -> List.of(ticket, ticket(43L, company));
        };
        when(tickets.findAllById(List.of(41L, 42L))).thenReturn(found);
        assertThrows(IllegalArgumentException.class, () -> service.bulkUpdate(bulkRequest(41L, 42L)));
        assertEquals(Ticket.TicketStatus.OPEN, ticket.getStatus());
        assertNull(ticket.getResolvedAt());
        verifyNoWrites();
    }

    @ParameterizedTest
    @MethodSource("invalidBulkIds")
    void bulkIdBoundsAreCheckedBeforeLoadingTickets(List<Long> ids) {
        authenticate(Role.RoleType.AGENT);
        BulkUpdateDto dto = bulkRequest(41L);
        dto.setTicketIds(ids);
        assertThrows(IllegalArgumentException.class, () -> service.bulkUpdate(dto));
        verifyNoInteractions(tickets, departments, contacts, threads);
    }

    static Stream<Arguments> invalidBulkIds() {
        return Stream.of(Arguments.of((Object) null), Arguments.of(List.of()), Arguments.of(List.of(41L, 41L)),
                Arguments.of(Arrays.asList(41L, null)), Arguments.of(List.of(0L)), Arguments.of(List.of(-1L)),
                Arguments.of(LongStream.rangeClosed(1, BulkUpdateDto.MAX_TICKET_IDS + 1L).boxed().toList()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"status", "priority", "empty"})
    void bulkParsesAllChangesBeforeLoadingOrMutatingAnyTicket(String invalidField) {
        authenticate(Role.RoleType.AGENT);
        BulkUpdateDto dto = bulkRequest(41L);
        if ("status".equals(invalidField)) dto.setStatus("NOT_A_STATUS");
        if ("priority".equals(invalidField)) dto.setPriority("NOT_A_PRIORITY");
        if ("empty".equals(invalidField)) dto.setStatus(" ");
        assertThrows(IllegalArgumentException.class, () -> service.bulkUpdate(dto));
        verifyNoInteractions(tickets, departments, contacts, threads);
    }

    @Test
    void validSameTenantBulkValidatesAllReplacementsThenSavesOnce() {
        authenticate(Role.RoleType.AGENT);
        Ticket second = ticket(42L, company);
        User assignee = user(22L, company, Role.RoleType.TEAM_LEAD);
        Department replacement = department(23L, company);
        when(tickets.findAllById(List.of(41L, 42L))).thenReturn(List.of(second, ticket));
        when(users.findById(22L)).thenReturn(Optional.of(assignee));
        when(departments.findById(23L)).thenReturn(Optional.of(replacement));
        BulkUpdateDto dto = bulkRequest(41L, 42L);
        dto.setStatus("resolved");
        dto.setPriority("high");
        dto.setAgentId(22L);
        dto.setDepartmentId(23L);

        service.bulkUpdate(dto);

        for (Ticket updated : List.of(ticket, second)) {
            assertEquals(Ticket.TicketStatus.RESOLVED, updated.getStatus());
            assertEquals(Ticket.TicketPriority.HIGH, updated.getPriority());
            assertSame(assignee, updated.getAssignedAgent());
            assertSame(replacement, updated.getDepartment());
            assertNotNull(updated.getResolvedAt());
        }
        assertEquals(ticket.getResolvedAt(), second.getResolvedAt());
        verify(tickets).saveAll(List.of(second, ticket));
        verify(tickets, never()).save(any());
        verifyNoInteractions(contacts, threads);
    }

    @ParameterizedTest
    @EnumSource(value = Role.RoleType.class, names = {"AGENT", "TEAM_LEAD", "COMPANY_ADMIN"})
    void ordinaryStaffKeepBasicStatusPriorityDepartmentAndAssignmentActions(Role.RoleType role) {
        authenticate(role);
        stubTicket();
        User assignee = user(22L, company, Role.RoleType.COMPANY_ADMIN);
        Department replacement = department(23L, company);
        when(users.findById(22L)).thenReturn(Optional.of(assignee));
        when(departments.findById(23L)).thenReturn(Optional.of(replacement));
        when(tickets.save(ticket)).thenReturn(ticket);

        assertSame(ticket, service.assignAgent(41L, 22L));
        assertEquals(Ticket.TicketStatus.IN_PROGRESS, ticket.getStatus());
        assertSame(ticket, service.updateDepartment(41L, 23L));
        assertSame(ticket, service.updatePriority(41L, Ticket.TicketPriority.HIGH));
        assertSame(ticket, service.updateStatus(41L, Ticket.TicketStatus.RESOLVED));
        assertSame(assignee, ticket.getAssignedAgent());
        assertSame(replacement, ticket.getDepartment());
        assertEquals(Ticket.TicketPriority.HIGH, ticket.getPriority());
        assertNotNull(ticket.getResolvedAt());
        verify(tickets, times(4)).save(ticket);
    }

    private void authenticate(Role.RoleType role) {
        actor.getRole().setRoleType(role);
        TenantContext.setContext(7L, actor.getId(), role.name(), actor.getEmail());
        when(users.findById(actor.getId())).thenReturn(Optional.of(actor));
    }

    private void stubTicket() {
        when(tickets.findById(41L)).thenReturn(Optional.of(ticket));
    }

    private void stubCreateReferences() {
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(departments.findById(20L)).thenReturn(Optional.of(department));
    }

    private void verifyNoWrites() {
        verify(tickets, never()).save(any());
        verify(tickets, never()).saveAll(any());
        verify(threads, never()).save(any());
        verify(contacts, never()).save(any());
    }

    private void invoke(String operation) {
        switch (operation) {
            case "list" -> service.getCompanyTickets(7L, null, null, PageRequest.of(0, 25));
            case "detail" -> service.getTicketById(41L);
            case "threads" -> service.getTicketThreads(41L);
            case "create" -> service.createTicket(createRequest());
            case "reply" -> service.addReply(41L, replyRequest());
            case "status" -> service.updateStatus(41L, Ticket.TicketStatus.RESOLVED);
            case "priority" -> service.updatePriority(41L, Ticket.TicketPriority.HIGH);
            case "department" -> service.updateDepartment(41L, 20L);
            case "assign" -> service.assignAgent(41L, 22L);
            case "bulk" -> service.bulkUpdate(bulkRequest(41L));
            case "scenario" -> service.executeScenario(41L, scenarioRequest());
            default -> fail("Unknown operation");
        }
    }

    private TicketCreateDto createRequest() {
        TicketCreateDto dto = new TicketCreateDto();
        dto.setCompanyId(7L);
        dto.setDepartmentId(20L);
        dto.setRequesterName("Requester");
        dto.setRequesterEmail("requester@example.invalid");
        dto.setSubject("A bounded ticket");
        dto.setDescription("Please review this request.");
        return dto;
    }

    private TicketReplyDto replyRequest() {
        TicketReplyDto dto = new TicketReplyDto();
        dto.setBody("A persisted reply, not a delivery confirmation.");
        return dto;
    }

    private ScenarioExecuteDto scenarioRequest() {
        ScenarioExecuteDto dto = new ScenarioExecuteDto();
        dto.setScenarioKey("KYC_RESUBMIT");
        return dto;
    }

    private BulkUpdateDto bulkRequest(Long... ids) {
        BulkUpdateDto dto = new BulkUpdateDto();
        dto.setTicketIds(List.of(ids));
        dto.setStatus("RESOLVED");
        return dto;
    }

    private Company company(Long id) {
        Company result = new Company();
        result.setId(id);
        result.setCompanyCode("T" + id);
        return result;
    }

    private Department department(Long id, Company owner) {
        Department result = new Department();
        result.setId(id);
        result.setCompany(owner);
        return result;
    }

    private User user(Long id, Company owner, Role.RoleType roleType) {
        Role role = new Role();
        role.setRoleType(roleType);
        role.setCompany(owner);
        User result = new User();
        result.setId(id);
        result.setCompany(owner);
        result.setRole(role);
        result.setEmail("staff" + id + "@example.invalid");
        result.setDisplayName("Staff " + id);
        return result;
    }

    private CustomerAccount account(Company owner) {
        CustomerAccount result = new CustomerAccount();
        result.setId(30L);
        result.setCompany(owner);
        return result;
    }

    private Ticket ticket(Long id, Company owner) {
        Contact contact = new Contact();
        contact.setId(31L);
        contact.setCompany(owner);
        contact.setAccount(account(owner));
        contact.setFirstName("Requester");
        contact.setEmail("requester@example.invalid");
        Ticket result = new Ticket();
        result.setId(id);
        result.setCompany(owner);
        result.setDepartment(department(20L, owner));
        result.setContact(contact);
        result.setSubject("A test ticket");
        result.setTicketNumber("T" + owner.getId() + "-1001");
        return result;
    }

    private TicketThread thread(Long id, boolean privateNote) {
        TicketThread result = new TicketThread();
        result.setId(id);
        result.setCompany(company);
        result.setTicket(ticket);
        result.setIsPrivate(privateNote);
        result.setThreadType(privateNote ? TicketThread.ThreadType.PRIVATE_NOTE : TicketThread.ThreadType.REPLY);
        return result;
    }
}
