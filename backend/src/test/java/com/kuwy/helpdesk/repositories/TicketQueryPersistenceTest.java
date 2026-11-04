package com.kuwy.helpdesk.repositories;

import com.kuwy.helpdesk.dto.TicketQuery;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.services.TicketQueryService;
import com.kuwy.helpdesk.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ContextConfiguration;

import java.time.LocalDateTime;
import java.util.List;

import static com.kuwy.helpdesk.models.Ticket.TicketPriority.*;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:ticket-query;MODE=MySQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver", "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop", "spring.sql.init.mode=never",
        "logging.level.org.hibernate.SQL=OFF", "logging.level.org.hibernate.orm.jdbc.bind=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@ContextConfiguration(classes = TicketQueryPersistenceTest.JpaConfiguration.class)
class TicketQueryPersistenceTest {
    @Configuration(proxyBeanMethods = false)
    @EntityScan(basePackageClasses = Ticket.class)
    @EnableJpaRepositories(basePackageClasses = TicketRepository.class)
    static class JpaConfiguration {}
    @Autowired private TestEntityManager em;
    @Autowired private TicketRepository repository;
    private int sequence;
    private static final LocalDateTime CREATED = LocalDateTime.of(2026, 1, 1, 23, 59, 59);
    @AfterEach void clearTenant() { TenantContext.clear(); }

    @Test
    void filtersAndHistorySeeOlderMatchesAcrossPagesWithoutForeignReferences() {
        Fixture own = fixture("one"), foreign = fixture("two");
        Ticket first = ticket(own, URGENT), second = ticket(own, URGENT);
        Ticket unassigned = ticket(own, URGENT), wildcardDecoy = ticket(own, URGENT);
        Ticket otherTenant = ticket(foreign, URGENT), corrupt = ticket(own, URGENT);
        for (Ticket ticket : List.of(first, second, unassigned, wildcardDecoy, otherTenant, corrupt)) {
            ticket.setSubject("Rate 50%_\\Evidence");
            ticket.setFirstResponseDueAt(LocalDateTime.now().minusDays(1));
        }
        unassigned.setAssignedAgent(null);
        wildcardDecoy.setSubject("Rate 50XYZ Evidence");
        corrupt.setContact(foreign.contact());
        ticket(own, URGENT).setAssignedAgent(foreign.agent());
        ticket(own, URGENT).setDepartment(foreign.department());
        for (int i = 0; i < 30; i++) ticket(own, LOW).setStatus(Ticket.TicketStatus.RESOLVED);
        em.flush(); em.clear();
        TicketQuery filter = query(own);
        filter.setStatus("open"); filter.setPriority("urgent"); filter.setAgentId(own.agent().getId());
        filter.setDepartmentId(own.department().getId()); filter.setContactId(own.contact().getId());
        filter.setCustomerEmail(" SHARED@EXAMPLE.INVALID "); filter.setChannel("email");
        filter.setQ("50%_\\evidence"); filter.setFrom("2026-01-01"); filter.setTo("2026-01-01");
        filter.setSlaStatus("BREACHED"); filter.setSize(1);
        TicketQueryService service = new TicketQueryService(repository);
        assertEquals(2, service.listTickets(filter).getTotalElements());
        assertEquals(second.getId(), service.listTickets(filter).getContent().getFirst().getId());
        filter.setPage(1);
        assertEquals(first.getId(), service.listTickets(filter).getContent().getFirst().getId());
        filter.setPage(0); filter.setFrom("2026-01-02"); filter.setTo("2026-01-02");
        assertTrue(service.listTickets(filter).isEmpty());
        filter.setFrom(null); filter.setTo("2026-01-01T00:00:00");
        assertTrue(service.listTickets(filter).isEmpty());
        filter.setFrom("2026-01-01"); filter.setTo("2026-01-01");
        filter.setPage(0); filter.setAgentId(foreign.agent().getId());
        assertTrue(service.listTickets(filter).isEmpty());
        filter.setAgentId(own.agent().getId()); filter.setDepartmentId(foreign.department().getId());
        assertTrue(service.listTickets(filter).isEmpty());
        filter.setDepartmentId(own.department().getId()); filter.setContactId(foreign.contact().getId());
        assertTrue(service.listTickets(filter).isEmpty());
        TicketQuery history = query(own);
        history.setCustomerEmail("shared@example.invalid");
        assertEquals(34, service.listTickets(history).getTotalElements());
        history.setPage(1);
        assertEquals(9, service.listTickets(history).getNumberOfElements());
        history.setPage(0); history.setUnassigned(true);
        assertEquals(List.of(unassigned.getId()), service.listTickets(history).map(Ticket::getId).getContent());
    }

    @Test
    void priorityUsesSeverityAndStableIdTiesInBothDirectionsAndCountPages() {
        Fixture own = fixture("priority");
        List<Ticket> rows = List.of(LOW, HIGH, MEDIUM, URGENT, URGENT).stream().map(p -> ticket(own, p)).toList();
        em.flush(); em.clear();
        TicketQuery filter = query(own);
        filter.setSortBy("priority");
        TicketQueryService service = new TicketQueryService(repository);
        assertEquals(List.of(rows.get(4), rows.get(3), rows.get(1), rows.get(2), rows.get(0)).stream().map(Ticket::getId).toList(),
                service.listTickets(filter).map(Ticket::getId).getContent());
        filter.setSize(1); filter.setPage(1);
        assertEquals(5, service.listTickets(filter).getTotalElements());
        assertEquals(rows.get(3).getId(), service.listTickets(filter).getContent().getFirst().getId());
        filter.setSize(25); filter.setPage(0); filter.setOrder("asc");
        assertEquals(List.of(rows.get(0), rows.get(2), rows.get(1), rows.get(3), rows.get(4)).stream().map(Ticket::getId).toList(),
                service.listTickets(filter).map(Ticket::getId).getContent());
        filter.setSortBy("updatedAt");
        assertEquals(rows.stream().map(Ticket::getId).toList(), service.listTickets(filter).map(Ticket::getId).getContent());
    }

    @Test
    void slaUsesOutstandingDeadlinesStoredFlagsAndExemptionWithoutInventedThresholds() {
        Fixture own = fixture("sla");
        LocalDateTime past = LocalDateTime.now().minusDays(1);
        Ticket overdue = ticket(own, LOW), answered = ticket(own, LOW), finished = ticket(own, LOW);
        Ticket exempt = ticket(own, LOW), resolution = ticket(own, LOW), nearing = ticket(own, LOW), stored = ticket(own, LOW);
        for (Ticket row : List.of(overdue, answered, finished, exempt)) row.setFirstResponseDueAt(past);
        answered.setFirstResponseAt(past.minusHours(1));
        finished.setStatus(Ticket.TicketStatus.RESOLVED);
        exempt.setSlaStatus(Ticket.SlaStatus.EXEMPT);
        resolution.setResolutionDueAt(past);
        nearing.setSlaStatus(Ticket.SlaStatus.NEARING_BREACH);
        nearing.setFirstResponseDueAt(LocalDateTime.now().plusDays(1));
        stored.setSlaStatus(Ticket.SlaStatus.BREACHED); stored.setStatus(Ticket.TicketStatus.CLOSED);
        em.flush(); em.clear();
        TicketQuery filter = query(own);
        TicketQueryService service = new TicketQueryService(repository);
        filter.setSlaStatus("BREACHED"); assertEquals(3, service.listTickets(filter).getTotalElements());
        filter.setSlaStatus("WITHIN_SLA"); assertEquals(2, service.listTickets(filter).getTotalElements());
        filter.setSlaStatus("EXEMPT"); assertEquals(1, service.listTickets(filter).getTotalElements());
        filter.setSlaStatus("NEARING_BREACH"); assertEquals(1, service.listTickets(filter).getTotalElements());
    }

    private record Fixture(Company company, Department department, Contact contact, User agent) {}

    private Fixture fixture(String slug) {
        Company company = new Company();
        company.setCompanyCode(slug); company.setName(slug); company.setSubdomain(slug);
        em.persistAndFlush(company);
        Department department = new Department();
        department.setCompany(company); department.setName("Support"); em.persistAndFlush(department);
        Contact contact = new Contact();
        contact.setCompany(company); contact.setFirstName("Requester"); contact.setLastName("Example");
        contact.setEmail("shared@example.invalid"); em.persistAndFlush(contact);
        Role role = new Role();
        role.setCompany(company); role.setName("Agent"); role.setRoleType(Role.RoleType.AGENT); em.persistAndFlush(role);
        User agent = new User();
        agent.setCompany(company); agent.setRole(role); agent.setEmail("staff@example.invalid");
        agent.setFirstName("Staff"); agent.setDisplayName("Staff"); agent.setPasswordHash("synthetic-test-only");
        em.persistAndFlush(agent);
        return new Fixture(company, department, contact, agent);
    }

    private Ticket ticket(Fixture fixture, Ticket.TicketPriority priority) {
        Ticket ticket = new Ticket();
        ticket.setCompany(fixture.company()); ticket.setDepartment(fixture.department()); ticket.setContact(fixture.contact());
        ticket.setAssignedAgent(fixture.agent()); ticket.setPriority(priority); ticket.setChannel(Ticket.TicketChannel.EMAIL);
        ticket.setSubject("Generic request"); ticket.setTicketNumber("QUERY-" + ++sequence);
        em.persistAndFlush(ticket);
        em.getEntityManager().createNativeQuery("UPDATE tickets SET created_at = :created, updated_at = :created WHERE id = :id")
                .setParameter("created", CREATED).setParameter("id", ticket.getId()).executeUpdate();
        return ticket;
    }

    private TicketQuery query(Fixture fixture) {
        TenantContext.setContext(fixture.company().getId(), fixture.agent().getId(), "AGENT", fixture.agent().getEmail());
        return new TicketQuery();
    }
}
