package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Contact;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Role;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.User;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.ContactRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.repositories.TicketAttachmentRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.TicketThreadRepository;
import com.kuwy.helpdesk.repositories.UserRepository;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.TicketService;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Optional;
import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TicketControllerAuthorizationTest {

    private static final String CREATE_JSON = "{\"departmentId\":20,\"requesterEmail\":\"requester@example.invalid\","
            + "\"requesterName\":\"Requester\",\"subject\":\"Test request\",\"description\":\"A bounded description\"}";
    private TicketRepository tickets;
    private TicketThreadRepository threads;
    private CompanyRepository companies;
    private DepartmentRepository departments;
    private ContactRepository contacts;
    private UserRepository users;
    private TicketAttachmentRepository attachments;
    private SubscriptionService subscriptions;
    private MockMvc mvc;

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
        subscriptions = mock(SubscriptionService.class);
        TicketService service = new TicketService(tickets, threads, companies, departments, contacts, users, attachments);
        mvc = MockMvcBuilders.standaloneSetup(new TicketController(service, subscriptions))
                .setControllerAdvice(new GlobalExceptionHandler()).build();
    }

    @AfterEach
    void clearContext() {
        TenantContext.clear();
    }

    @ParameterizedTest
    @MethodSource("staffRequests")
    void unsignedRequestsCannotUseATenantHeaderOrDefaultCompany(MockHttpServletRequestBuilder request) throws Exception {
        mvc.perform(request.header("X-Company-ID", "1").contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isForbidden());
        verifyNoInteractions(tickets, threads, companies, departments, contacts, users, attachments, subscriptions);
    }

    static Stream<MockHttpServletRequestBuilder> staffRequests() {
        return Stream.of(get("/api/v1/tickets"), get("/api/v1/tickets/41"), get("/api/v1/tickets/41/threads"),
                post("/api/v1/tickets").content(CREATE_JSON),
                post("/api/v1/tickets/41/replies").content("{\"body\":\"A reply\"}"),
                patch("/api/v1/tickets/41/status").param("status", "RESOLVED"),
                patch("/api/v1/tickets/41/priority").param("priority", "HIGH"),
                patch("/api/v1/tickets/41/department").param("departmentId", "20"),
                patch("/api/v1/tickets/41/assign").param("agentId", "22"),
                post("/api/v1/tickets/bulk").content("{\"ticketIds\":[41],\"status\":\"RESOLVED\"}"),
                post("/api/v1/tickets/41/execute-scenario").content("{\"scenarioKey\":\"KYC_RESUBMIT\"}"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"size=0", "size=101", "page=-1", "page=100001", "sortBy=company.settingsJson", "order=sideways"})
    void invalidListBoundsReturnBadRequestBeforeRepositoryQueries(String query) throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        String[] parameter = query.split("=");
        mvc.perform(get("/api/v1/tickets").param(parameter[0], parameter[1]))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(tickets, companies, users);
    }

    @Test
    void listKeepsLastMessageSortAliasAndDefaultsToTheAuthenticatedTenant() throws Exception {
        Company company = authenticateAndStubTicket("AGENT");
        PageRequest page = PageRequest.of(0, 25, Sort.by(Sort.Direction.ASC, "updatedAt"));
        when(companies.findById(7L)).thenReturn(Optional.of(company));
        when(tickets.findByCompanyId(7L, page)).thenReturn(Page.empty(page));

        mvc.perform(get("/api/v1/tickets").param("sortBy", "lastMessageAt").param("order", "asc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isEmpty());

        verify(tickets).findByCompanyId(7L, page);
        verifyNoInteractions(subscriptions);
    }

    @Test
    void foreignCreateCompanyIsRejectedBeforeQuotaChecksOrWrites() throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        String body = CREATE_JSON.replace("{", "{\"companyId\":8,");
        mvc.perform(post("/api/v1/tickets").contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isForbidden());
        verifyNoInteractions(subscriptions, tickets, contacts, threads, users);
    }

    @Test
    void invalidCreateBodyReturnsBadRequestWithoutQuotaOrPersistenceCalls() throws Exception {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        mvc.perform(post("/api/v1/tickets").contentType(MediaType.APPLICATION_JSON)
                        .content(CREATE_JSON.replace("requester@example.invalid", "not-an-email")))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(subscriptions, tickets, contacts, threads, users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"AGENT", "LIGHT_AGENT"})
    void replyAndScenarioCannotBypassReadOnlyRestrictions(String role) throws Exception {
        authenticateAndStubTicket(role);
        when(subscriptions.isWorkspaceLocked(7L)).thenReturn(true);
        int expectedStatus = "LIGHT_AGENT".equals(role) ? 403 : 423;

        mvc.perform(post("/api/v1/tickets/41/replies").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"body\":\"A private note\",\"isPrivate\":true}"))
                .andExpect(status().is(expectedStatus));
        mvc.perform(post("/api/v1/tickets/41/execute-scenario").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"scenarioKey\":\"ESCALATE_LEAD\",\"authorName\":\"Forged Admin\"}"))
                .andExpect(status().is(expectedStatus));

        verify(tickets, never()).save(any());
        verify(threads, never()).save(any());
        if ("LIGHT_AGENT".equals(role)) verifyNoInteractions(users, tickets, subscriptions);
    }

    private Company authenticateAndStubTicket(String roleName) {
        Company company = new Company();
        company.setId(7L);
        Role role = new Role();
        role.setRoleType(Role.RoleType.valueOf(roleName));
        User actor = new User();
        actor.setId(11L);
        actor.setCompany(company);
        actor.setRole(role);
        actor.setEmail("staff@example.invalid");
        actor.setDisplayName("Authenticated Staff");
        TenantContext.setContext(7L, 11L, roleName, actor.getEmail());
        when(users.findById(11L)).thenReturn(Optional.of(actor));
        Department department = new Department();
        department.setId(20L);
        department.setCompany(company);
        Contact contact = new Contact();
        contact.setId(31L);
        contact.setCompany(company);
        contact.setFirstName("Requester");
        contact.setEmail("requester@example.invalid");
        Ticket ticket = new Ticket();
        ticket.setId(41L);
        ticket.setCompany(company);
        ticket.setDepartment(department);
        ticket.setContact(contact);
        ticket.setTicketNumber("T7-1001");
        ticket.setSubject("Test ticket");
        when(tickets.findById(41L)).thenReturn(Optional.of(ticket));
        return company;
    }
}
