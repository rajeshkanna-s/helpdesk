package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.TicketQuery;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.criteria.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;

import java.util.Arrays;
import java.util.List;
import java.util.function.Consumer;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class TicketQueryServiceTest {
    private final TicketRepository repository = mock(TicketRepository.class);
    private final TicketQueryService service = new TicketQueryService(repository);
    @AfterEach void clearTenant() { TenantContext.clear(); }

    @Test
    void missingCustomerAndForeignIdentitiesNeverQueryTickets() {
        TenantContext.clear();
        TenantContext.setCompanyId(7L);
        assertThrows(SecurityException.class, () -> service.listTickets(new TicketQuery()));
        TenantContext.setContext(7L, 11L, "CUSTOMER", "customer@example.invalid");
        assertThrows(SecurityException.class, () -> service.listTickets(new TicketQuery()));
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        TicketQuery query = new TicketQuery();
        query.setCompanyId(8L);
        assertThrows(SecurityException.class, () -> service.listTickets(query));
        verifyNoInteractions(repository);
    }

    @Test
    void malformedFiltersAreRejectedBeforePersistence() {
        TenantContext.setContext(7L, 11L, "AGENT", "staff@example.invalid");
        for (Consumer<TicketQuery> invalid : List.<Consumer<TicketQuery>>of(
                q -> q.setSize(2), q -> q.setSize(101), q -> q.setPage(-1), q -> q.setPage(100001),
                q -> q.setQ("x".repeat(251)), q -> q.setCustomerEmail("not-email"), q -> q.setContactId(0L),
                q -> q.setStatus("WAITING"), q -> q.setPriority("CRITICAL"), q -> q.setChannel("SMS"),
                q -> q.setSlaStatus("OVERDUE"), q -> q.setSortBy("company.id"), q -> q.setOrder("sideways"),
                q -> q.setFrom("2026-02-30"), q -> q.setTo("0999-01-01"),
                q -> { q.setFrom("2026-02-02"); q.setTo("2026-02-01"); },
                q -> { q.setUnassigned(true); q.setAgentId(11L); })) {
            TicketQuery query = new TicketQuery();
            invalid.accept(query);
            assertThrows(IllegalArgumentException.class, () -> service.listTickets(query));
        }
        verifyNoInteractions(repository);
    }

    @Test
    @SuppressWarnings("unchecked")
    void lightAgentUsesTenantFirstAndFiltersLiteralSearchAndUnsortedCountCriteria() {
        TenantContext.setContext(7L, 11L, "LIGHT_AGENT", "staff@example.invalid");
        TicketQuery filter = new TicketQuery();
        filter.setStatus(" open "); filter.setAgentId(11L); filter.setQ("A%_\\B");
        filter.setSortBy("priority"); filter.setSize(1);
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(new Ticket()), PageRequest.of(0, 1), 37));
        Page<Ticket> page = service.listTickets(filter);
        assertEquals(37, page.getTotalElements());
        assertEquals(Sort.by(Sort.Direction.DESC, "priority", "id"), page.getSort());
        ArgumentCaptor<Specification<Ticket>> capture = ArgumentCaptor.forClass(Specification.class);
        verify(repository).findAll(capture.capture(), eq(PageRequest.of(0, 1)));
        Root<Ticket> root = mock(Root.class, RETURNS_DEEP_STUBS);
        CriteriaBuilder cb = mock(CriteriaBuilder.class, RETURNS_DEEP_STUBS);
        CriteriaQuery<Ticket> select = mock(CriteriaQuery.class);
        when(select.getResultType()).thenReturn(Ticket.class);
        capture.getValue().toPredicate(root, select, cb);
        inOrder(cb).verify(cb).equal(root.get("company").get("id"), 7L);
        ArgumentCaptor<Predicate[]> terms = ArgumentCaptor.forClass(Predicate[].class);
        verify(cb).and(terms.capture());
        assertSame(cb.equal(root.get("company").get("id"), 7L), terms.getValue()[0]);
        assertTrue(Arrays.asList(terms.getValue()).contains(cb.equal(root.get("status"), Ticket.TicketStatus.OPEN)));
        assertTrue(Arrays.asList(terms.getValue()).contains(cb.equal(root.join("assignedAgent", JoinType.LEFT).get("id"), 11L)));
        verify(cb, times(7)).like(any(), eq("%a\\%\\_\\\\b%"), eq('\\'));
        verify(cb).selectCase();
        verify(cb).desc(root.get("id"));
        verify(select).orderBy(any(Order.class), any(Order.class));
        CriteriaQuery<Long> count = mock(CriteriaQuery.class);
        when(count.getResultType()).thenReturn(Long.class);
        clearInvocations(cb);
        capture.getValue().toPredicate(root, count, cb);
        verify(cb, never()).selectCase();
        verify(count, never()).orderBy(any(Order[].class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void superAdminCanSelectAnotherTenantButStillPassesABoundedSpecification() {
        TenantContext.setContext(7L, 11L, "SUPER_ADMIN", "staff@example.invalid");
        TicketQuery filter = new TicketQuery();
        filter.setCompanyId(8L);
        when(repository.findAll(any(Specification.class), any(Pageable.class))).thenReturn(Page.empty());
        service.listTickets(filter);
        ArgumentCaptor<Specification<Ticket>> capture = ArgumentCaptor.forClass(Specification.class);
        verify(repository).findAll(capture.capture(), eq(PageRequest.of(0, 25)));
        Root<Ticket> root = mock(Root.class, RETURNS_DEEP_STUBS);
        CriteriaBuilder cb = mock(CriteriaBuilder.class, RETURNS_DEEP_STUBS);
        capture.getValue().toPredicate(root, null, cb);
        inOrder(cb).verify(cb).equal(root.get("company").get("id"), 8L);
    }
}
