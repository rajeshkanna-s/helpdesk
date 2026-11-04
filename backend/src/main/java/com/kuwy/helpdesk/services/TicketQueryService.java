package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.TicketQuery;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.criteria.Expression;
import jakarta.persistence.criteria.JoinType;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class TicketQueryService {
    private final TicketRepository ticketRepository;

    @Transactional(readOnly = true)
    public Page<Ticket> listTickets(TicketQuery filter) {
        TenantContext.requireUserId();
        if (filter == null) throw new IllegalArgumentException("Ticket query is required.");
        filter.validate();
        Long companyId = filter.getCompanyId() == null ? TenantContext.getCompanyId() : filter.getCompanyId();
        TenantContext.assertAccessTo(companyId);
        LocalDateTime from = filter.fromDateTime();
        LocalDateTime to = filter.toDateTime();
        LocalDateTime now = LocalDateTime.now();
        boolean ascending = "asc".equals(filter.getOrder());

        Specification<Ticket> specification = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.equal(root.get("company").get("id"), companyId));
            predicates.add(root.get("company").get("status").in(Company.CompanyStatus.ACTIVE, Company.CompanyStatus.TRIAL));
            var contact = root.join("contact");
            var department = root.join("department");
            var agent = root.join("assignedAgent", JoinType.LEFT);
            var account = contact.join("account", JoinType.LEFT);
            // Corrupt historical references must not expose another tenant's related records.
            predicates.add(cb.equal(contact.get("company").get("id"), companyId));
            predicates.add(cb.equal(department.get("company").get("id"), companyId));
            predicates.add(cb.or(cb.isNull(agent.get("id")), cb.equal(agent.get("company").get("id"), companyId)));
            predicates.add(cb.or(cb.isNull(account.get("id")), cb.equal(account.get("company").get("id"), companyId)));
            if (filter.getStatus() != null) predicates.add(cb.equal(root.get("status"), Ticket.TicketStatus.valueOf(filter.getStatus())));
            if (filter.getPriority() != null) predicates.add(cb.equal(root.get("priority"), Ticket.TicketPriority.valueOf(filter.getPriority())));
            if (filter.getAgentId() != null) predicates.add(cb.equal(agent.get("id"), filter.getAgentId()));
            if (filter.isUnassigned()) predicates.add(cb.isNull(agent.get("id")));
            if (filter.getDepartmentId() != null) predicates.add(cb.equal(department.get("id"), filter.getDepartmentId()));
            if (filter.getContactId() != null) predicates.add(cb.equal(contact.get("id"), filter.getContactId()));
            if (filter.getChannel() != null) predicates.add(cb.equal(root.get("channel"), Ticket.TicketChannel.valueOf(filter.getChannel())));
            if (filter.getCustomerEmail() != null) {
                predicates.add(cb.equal(cb.lower(contact.get("email")), filter.getCustomerEmail().toLowerCase(Locale.ROOT)));
            }
            if (from != null) predicates.add(cb.greaterThanOrEqualTo(root.get("createdAt"), from));
            if (to != null) predicates.add(cb.lessThanOrEqualTo(root.get("createdAt"), to));
            if (filter.getQ() != null) {
                String pattern = "%" + filter.getQ().toLowerCase(Locale.ROOT)
                        .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("subject")), pattern, '\\'),
                        cb.like(cb.lower(root.get("ticketNumber")), pattern, '\\'),
                        cb.like(cb.lower(contact.get("firstName")), pattern, '\\'),
                        cb.like(cb.lower(contact.get("lastName")), pattern, '\\'),
                        cb.like(cb.lower(contact.get("email")), pattern, '\\'),
                        cb.like(cb.lower(root.get("descriptionText")), pattern, '\\'),
                        cb.like(cb.lower(root.get("descriptionHtml")), pattern, '\\')));
            }
            if (filter.getSlaStatus() != null) {
                Predicate overdue = cb.and(
                        cb.not(root.get("status").in(Ticket.TicketStatus.RESOLVED, Ticket.TicketStatus.CLOSED)),
                        cb.notEqual(root.get("slaStatus"), Ticket.SlaStatus.EXEMPT),
                        cb.or(cb.and(cb.isNull(root.get("firstResponseAt")), cb.isNotNull(root.get("firstResponseDueAt")),
                                        cb.lessThan(root.get("firstResponseDueAt"), now)),
                                cb.and(cb.isNull(root.get("resolvedAt")), cb.isNotNull(root.get("resolutionDueAt")),
                                        cb.lessThan(root.get("resolutionDueAt"), now))));
                Ticket.SlaStatus slaStatus = Ticket.SlaStatus.valueOf(filter.getSlaStatus());
                Predicate stored = cb.equal(root.get("slaStatus"), slaStatus);
                predicates.add(switch (slaStatus) {
                    case BREACHED -> cb.or(stored, overdue);
                    case WITHIN_SLA, NEARING_BREACH -> cb.and(stored, cb.not(overdue));
                    case EXEMPT -> stored;
                });
            }
            // Pageable stays unsorted so Spring Data cannot replace the numeric CASE ordering.
            // Counts reuse only predicates, without an ORDER BY or collection fetch joins.
            if (query != null && query.getResultType() != Long.class && query.getResultType() != long.class) {
                Expression<?> sort = root.get(filter.getSortBy());
                if ("priority".equals(filter.getSortBy())) {
                    sort = cb.<Integer>selectCase()
                            .when(cb.equal(root.get("priority"), Ticket.TicketPriority.URGENT), 4)
                            .when(cb.equal(root.get("priority"), Ticket.TicketPriority.HIGH), 3)
                            .when(cb.equal(root.get("priority"), Ticket.TicketPriority.MEDIUM), 2)
                            .when(cb.equal(root.get("priority"), Ticket.TicketPriority.LOW), 1).otherwise(0);
                }
                query.orderBy(ascending ? cb.asc(sort) : cb.desc(sort),
                        ascending ? cb.asc(root.get("id")) : cb.desc(root.get("id")));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
        Page<Ticket> result = ticketRepository.findAll(specification, PageRequest.of(filter.getPage(), filter.getSize()));
        PageRequest page = PageRequest.of(filter.getPage(), filter.getSize(),
                Sort.by(ascending ? Sort.Direction.ASC : Sort.Direction.DESC, filter.getSortBy(), "id"));
        return new PageImpl<>(result.getContent(), page, result.getTotalElements());
    }
}
