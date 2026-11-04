package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.controllers.PublicPortalController.PublicTicketCreateDto;
import com.kuwy.helpdesk.dto.PortalTicketDto;
import com.kuwy.helpdesk.dto.PortalTicketDto.*;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import com.kuwy.helpdesk.util.HtmlSanitizer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

import static com.kuwy.helpdesk.models.Ticket.TicketStatus.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PortalTicketService {
    private static final List<Ticket.TicketStatus> PUBLIC_STATUSES = List.of(
            OPEN, IN_PROGRESS, WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY, RESOLVED, CLOSED);
    private static final String OWNER = " from Ticket t where t.company.id = :companyId"
            + " and t.contact.id = :contactId and t.contact.company.id = :companyId and t.status in :statuses";
    private final CompanyRepository companies;
    private final ContactRepository contacts;
    private final DepartmentRepository departments;
    private final TicketThreadRepository threads;
    private final TicketAttachmentRepository attachments;
    private final SubscriptionService subscriptions;
    private final AccountEmailService emails;
    private final RateLimiterService limits;
    private final EntityManager em;
    private final ObjectMapper json;

    public Page<PortalTicketDto> list(String subdomain, String email, int page, int size, String q, String status) {
        return page(authenticate(subdomain, email), page, size, q, status);
    }

    public PortalTicketDto detail(String subdomain, String number, String email) {
        Actor actor = authenticate(subdomain, email);
        return view(owned(actor, number, false), actor, null);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PortalTicketDto create(String subdomain, PublicTicketCreateDto dto, String clientIp) {
        Actor actor = authenticate(subdomain, dto == null ? null : dto.getRequesterEmail());
        if (dto == null) throw error(HttpStatus.BAD_REQUEST, "Ticket request is required");
        String subject = text(dto.getSubject(), 500, true);
        String description = text(dto.getDescription(), 100_000, true);
        text(dto.getRequesterName(), 200, false);
        if (subject.chars().anyMatch(Character::isISOControl)
                || dto.getWebsiteUrl() != null && !dto.getWebsiteUrl().isBlank()
                || dto.getHpToken() != null && !dto.getHpToken().isBlank()) {
            throw error(HttpStatus.BAD_REQUEST, "Invalid ticket request");
        }
        if (!limits.allowTicketSubmission(clientIp == null || clientIp.isBlank() ? "unknown" : clientIp,
                actor.company().getId() + ":" + actor.contact().getId())) {
            throw error(HttpStatus.TOO_MANY_REQUESTS, "Too many ticket requests");
        }
        // Refresh after acquiring the shared company lock so quota and numbering see committed writers.
        em.refresh(actor.company(), LockModeType.PESSIMISTIC_WRITE);
        writable(actor);
        Department department = dto.getDepartmentId() == null || dto.getDepartmentId() <= 0 ? null
                : departments.findById(dto.getDepartmentId()).orElse(null);
        if (department == null || !Objects.equals(department.getId(), dto.getDepartmentId())
                || !sameCompany(department.getCompany(), actor) || !Boolean.TRUE.equals(department.getIsActive())) {
            throw error(HttpStatus.BAD_REQUEST, "An active workspace department is required");
        }
        try {
            subscriptions.assertCanCreateTicket(actor.company().getId());
        } catch (IllegalStateException unavailable) {
            throw error(HttpStatus.PAYMENT_REQUIRED, "Ticket quota is unavailable");
        }
        Number max = (Number) em.createNativeQuery("select coalesce(max(cast(substring_index(ticket_number, '-', -1)"
                        + " as unsigned)), 1000) from tickets where company_id = :companyId")
                .setParameter("companyId", actor.company().getId()).getSingleResult();
        long next = Math.addExact(Math.max(1000L, max == null ? 1000L : max.longValue()), 1L);
        String code = actor.company().getCompanyCode();
        String number = code + "-" + next;
        if (code == null || code.isBlank() || number.length() > 50 || code.chars().anyMatch(Character::isISOControl)) {
            throw error(HttpStatus.CONFLICT, "Ticket numbering is unavailable");
        }
        Ticket ticket = new Ticket();
        ticket.setCompany(actor.company());
        ticket.setContact(actor.contact());
        ticket.setDepartment(department);
        ticket.setTicketNumber(number);
        ticket.setSubject(subject);
        ticket.setDescriptionText(description);
        ticket.setDescriptionHtml(HtmlSanitizer.clean(dto.getDescription()));
        ticket.setPriority(dto.getPriority() == null ? Ticket.TicketPriority.MEDIUM : dto.getPriority());
        ticket.setStatus(OPEN);
        ticket.setChannel(Ticket.TicketChannel.WEB_PORTAL);
        ticket.setFirstResponseDueAt(LocalDateTime.now().plusHours(4)); // Existing basic fallback, not a configured SLA.
        em.persist(ticket);
        addThread(ticket, actor, ticket.getDescriptionHtml(), description);
        em.refresh(ticket);
        String notification = "not_configured";
        if (emails.isReady()) {
            try {
                String receipt = emails.enqueue(actor.company().getId(), actor.email(), "Support request received",
                        HtmlSanitizer.clean("<p>Your support request has been recorded.</p><p>"
                                + HtmlUtils.htmlEscape(number) + "</p>"),
                        "portal-ticket:" + actor.company().getId() + ":" + ticket.getId() + ":created");
                if (receipt == null || receipt.isBlank()) throw new IllegalStateException();
                notification = "queued";
            } catch (IllegalStateException unavailable) {
                throw error(HttpStatus.SERVICE_UNAVAILABLE, "Ticket notification could not be queued");
            }
        }
        return view(ticket, actor, notification);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PortalTicketDto reply(String subdomain, String number, Map<String, Object> body) {
        Actor actor = authenticate(subdomain, null);
        if (body == null || !Set.of("email", "reply").containsAll(body.keySet())) {
            throw error(HttpStatus.BAD_REQUEST, "Invalid reply request");
        }
        checkEmail(actor, body.get("email"));
        String message = text(body.get("reply"), 100_000, true);
        Ticket ticket = owned(actor, number, true);
        writable(actor);
        addThread(ticket, actor, HtmlSanitizer.clean((String) body.get("reply")), message);
        if (List.of(WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY, RESOLVED, CLOSED).contains(ticket.getStatus())) {
            ticket.setStatus(OPEN);
        }
        ticket.setResolvedAt(null);
        touch(ticket, actor);
        return view(ticket, actor, null);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PortalTicketDto reopen(String subdomain, String number, String email) {
        return changeStatus(subdomain, number, email, false);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public PortalTicketDto close(String subdomain, String number, String email) {
        return changeStatus(subdomain, number, email, true);
    }

    private PortalTicketDto changeStatus(String subdomain, String number, String email, boolean resolve) {
        Actor actor = authenticate(subdomain, email);
        Ticket ticket = owned(actor, number, true);
        writable(actor);
        boolean change = resolve ? ticket.getStatus() != CLOSED
                && (ticket.getStatus() != RESOLVED || ticket.getResolvedAt() == null)
                : ticket.getStatus() != OPEN || ticket.getResolvedAt() != null;
        if (change) {
            ticket.setStatus(resolve ? RESOLVED : OPEN);
            ticket.setResolvedAt(resolve ? LocalDateTime.now() : null);
            touch(ticket, actor);
        }
        return view(ticket, actor, null);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Csat csat(String subdomain, String number, Map<String, Object> body) {
        Actor actor = authenticate(subdomain, null);
        if (body == null || !Set.of("email", "rating", "comment").containsAll(body.keySet())) {
            throw error(HttpStatus.BAD_REQUEST, "Invalid feedback request");
        }
        checkEmail(actor, body.get("email"));
        Object rating = body.get("rating");
        if (!(rating instanceof Integer || rating instanceof Long)
                || ((Number) rating).longValue() < 1 || ((Number) rating).longValue() > 5) {
            throw error(HttpStatus.BAD_REQUEST, "Rating must be an integer from 1 to 5");
        }
        String comment = text(body.get("comment"), 2000, false);
        Ticket ticket = owned(actor, number, true);
        writable(actor);
        if (ticket.getStatus() != RESOLVED && ticket.getStatus() != CLOSED) {
            throw error(HttpStatus.CONFLICT, "Feedback requires a resolved or closed ticket");
        }
        try {
            var settings = json.readTree(Objects.toString(actor.company().getSettingsJson(), "{}"));
            if (settings != null && settings.path("csat").path("enabled").isBoolean()
                    && !settings.path("csat").path("enabled").booleanValue()) {
                throw error(HttpStatus.FORBIDDEN, "Customer feedback is disabled");
            }
        } catch (JsonProcessingException invalidSettings) {
            throw error(HttpStatus.SERVICE_UNAVAILABLE, "Customer feedback settings are unavailable");
        }
        var existing = em.createNativeQuery("select rating, comment, created_at from ticket_csat"
                        + " where company_id = :companyId and ticket_id = :ticketId and contact_id = :contactId")
                .setParameter("companyId", actor.company().getId()).setParameter("ticketId", ticket.getId())
                .setParameter("contactId", actor.contact().getId()).setMaxResults(1).getResultList();
        if (!existing.isEmpty()) {
            Object[] row = (Object[]) existing.get(0);
            LocalDateTime at = row[2] instanceof Timestamp timestamp ? timestamp.toLocalDateTime()
                    : row[2] instanceof LocalDateTime date ? date : null;
            return new Csat(true, ((Number) row[0]).intValue(), plain((String) row[1]), at);
        }
        LocalDateTime now = LocalDateTime.now().withNano(0);
        em.createNativeQuery("insert into ticket_csat (company_id, ticket_id, contact_id, rating, comment, created_at)"
                        + " values (:companyId, :ticketId, :contactId, :rating, :comment, :createdAt)")
                .setParameter("companyId", actor.company().getId()).setParameter("ticketId", ticket.getId())
                .setParameter("contactId", actor.contact().getId()).setParameter("rating", ((Number) rating).intValue())
                .setParameter("comment", comment).setParameter("createdAt", now).executeUpdate();
        return new Csat(true, ((Number) rating).intValue(), comment, now);
    }

    public Map<String, Object> export(String subdomain, String email, int page, int size) {
        Actor actor = authenticate(subdomain, email);
        Page<PortalTicketDto> tickets = page(actor, page, size, null, null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scope", "customer");
        result.put("customerEmail", actor.email());
        result.put("companyName", plain(actor.company().getName()));
        result.put("exportedAt", LocalDateTime.now());
        result.put("totalTickets", tickets.getTotalElements());
        result.put("page", tickets.getNumber());
        result.put("size", tickets.getSize());
        result.put("totalPages", tickets.getTotalPages());
        result.put("hasNext", tickets.hasNext());
        result.put("tickets", tickets.getContent());
        return result;
    }

    private Page<PortalTicketDto> page(Actor actor, int page, int size, String q, String status) {
        if (page < 0 || page > 100_000 || size < 1 || size > 100
                || q != null && q.length() > 250 || status != null && status.length() > 32) {
            throw error(HttpStatus.BAD_REQUEST, "Invalid ticket page or search");
        }
        List<Ticket.TicketStatus> statuses = PUBLIC_STATUSES;
        if (status != null && !status.isBlank() && !"ALL".equalsIgnoreCase(status.trim())) {
            try {
                String value = status.trim().toUpperCase(Locale.ROOT);
                statuses = "WAITING".equals(value) ? List.of(WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY)
                        : List.of(Ticket.TicketStatus.valueOf(value));
                if (!PUBLIC_STATUSES.containsAll(statuses)) throw new IllegalArgumentException();
            } catch (IllegalArgumentException invalidStatus) {
                throw error(HttpStatus.BAD_REQUEST, "Invalid customer ticket status");
            }
        }
        String where = OWNER;
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("companyId", actor.company().getId());
        params.put("contactId", actor.contact().getId());
        params.put("statuses", statuses);
        if (q != null && !q.isBlank()) {
            where += " and (lower(t.subject) like :q escape '!' or lower(t.ticketNumber) like :q escape '!'"
                    + " or lower(t.descriptionText) like :q escape '!')";
            params.put("q", "%" + q.trim().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%")
                    .replace("_", "!_") + "%");
        }
        var count = em.createQuery("select count(t)" + where, Long.class);
        params.forEach(count::setParameter);
        long total = count.getSingleResult();
        var query = em.createQuery("select t" + where + " order by t.createdAt desc, t.id desc", Ticket.class);
        params.forEach(query::setParameter);
        List<PortalTicketDto> content = query.setFirstResult(page * size).setMaxResults(size).getResultList().stream()
                .map(ticket -> view(ticket, actor, null)).toList();
        return new PageImpl<>(content, PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt", "id")), total);
    }

    private Actor authenticate(String subdomain, String requestedEmail) {
        if (subdomain == null || !subdomain.matches("[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,98}[a-zA-Z0-9])?")) {
            throw error(HttpStatus.NOT_FOUND, "Company not found");
        }
        Company company = companies.findBySubdomain(subdomain.toLowerCase(Locale.ROOT))
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Company not found"));
        if (company.getId() == null || company.getId() <= 0 || !subdomain.equalsIgnoreCase(company.getSubdomain())) {
            throw error(HttpStatus.NOT_FOUND, "Company not found");
        }
        Long id;
        try {
            id = TenantContext.requireCustomerId(company.getId());
        } catch (SecurityException invalid) {
            throw error(HttpStatus.UNAUTHORIZED, "Verified customer sign-in required");
        }
        Contact contact = contacts.findById(id)
                .orElseThrow(() -> error(HttpStatus.UNAUTHORIZED, "Verified customer sign-in required"));
        String email;
        try {
            email = CustomerOtpService.canonicalEmail(contact.getEmail());
        } catch (IllegalArgumentException invalid) {
            throw error(HttpStatus.UNAUTHORIZED, "Verified customer sign-in required");
        }
        Actor actor = new Actor(company, contact, email);
        if (!Objects.equals(contact.getId(), id) || !sameCompany(contact.getCompany(), actor)
                || !Boolean.TRUE.equals(contact.getIsPortalUser()) || !Boolean.FALSE.equals(contact.getIsBlocked())
                || !email.equalsIgnoreCase(TenantContext.getUserEmail().trim())) {
            throw error(HttpStatus.UNAUTHORIZED, "Verified customer sign-in required");
        }
        checkEmail(actor, requestedEmail);
        return actor;
    }

    private void checkEmail(Actor actor, Object requested) {
        if (requested == null) return;
        if (!(requested instanceof String email) || email.length() > 254
                || !actor.email().equalsIgnoreCase(email.trim())) {
            throw error(HttpStatus.FORBIDDEN, "Customer identity does not match this session");
        }
    }

    private Ticket owned(Actor actor, String number, boolean lock) {
        if (number == null || number.isBlank() || number.length() > 50) throw error(HttpStatus.NOT_FOUND, "Ticket not found");
        var query = em.createQuery("select t" + OWNER + " and t.ticketNumber = :number", Ticket.class)
                .setParameter("companyId", actor.company().getId()).setParameter("contactId", actor.contact().getId())
                .setParameter("statuses", PUBLIC_STATUSES).setParameter("number", number).setMaxResults(1);
        if (lock) query.setLockMode(LockModeType.PESSIMISTIC_WRITE).setHint("jakarta.persistence.lock.timeout", 2000);
        Ticket ticket = query.getResultList().stream().findFirst()
                .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "Ticket not found"));
        assertOwner(ticket, actor);
        return ticket;
    }

    private void assertOwner(Ticket ticket, Actor actor) {
        if (!sameCompany(ticket.getCompany(), actor) || ticket.getContact() == null
                || !Objects.equals(ticket.getContact().getId(), actor.contact().getId())
                || !sameCompany(ticket.getContact().getCompany(), actor)
                || ticket.getStatus() == null || !PUBLIC_STATUSES.contains(ticket.getStatus())
                || ticket.getDepartment() != null && !sameCompany(ticket.getDepartment().getCompany(), actor)) {
            throw error(HttpStatus.NOT_FOUND, "Ticket not found");
        }
    }

    private void writable(Actor actor) {
        if (actor.company().getStatus() != Company.CompanyStatus.ACTIVE && actor.company().getStatus() != Company.CompanyStatus.TRIAL) {
            throw error(HttpStatus.FORBIDDEN, "Workspace is not active");
        }
        if (subscriptions.isWorkspaceLocked(actor.company().getId())) {
            throw error(HttpStatus.PAYMENT_REQUIRED, "Workspace is locked");
        }
    }

    private void addThread(Ticket ticket, Actor actor, String html, String text) {
        TicketThread thread = new TicketThread();
        thread.setCompany(actor.company());
        thread.setTicket(ticket);
        thread.setSenderContact(actor.contact());
        thread.setSenderType(TicketThread.SenderType.CUSTOMER);
        thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
        thread.setFromEmail(actor.email());
        String name = (plain(actor.contact().getFirstName()) + " " + plain(actor.contact().getLastName())).trim();
        thread.setFromName(name.isBlank() ? "Customer" : name);
        thread.setSubject(ticket.getSubject());
        thread.setBodyHtml(HtmlSanitizer.clean(html));
        thread.setBodyText(text);
        thread.setIsPrivate(false);
        TicketThread saved = threads.save(thread);
        em.flush();
        em.refresh(saved);
    }

    private void touch(Ticket ticket, Actor actor) {
        em.flush();
        LocalDateTime now = LocalDateTime.now();
        // updatedAt is read-only in the existing entity; an OPEN-ticket reply still needs a durable timestamp.
        em.createNativeQuery("update tickets set updated_at = :now where id = :id"
                        + " and company_id = :companyId and contact_id = :contactId")
                .setParameter("now", now).setParameter("id", ticket.getId())
                .setParameter("companyId", actor.company().getId()).setParameter("contactId", actor.contact().getId())
                .executeUpdate();
        ticket.setUpdatedAt(now);
    }

    private PortalTicketDto view(Ticket ticket, Actor actor, String notification) {
        assertOwner(ticket, actor);
        List<TicketThread> visible = threads.findByTicketIdOrderByCreatedAtAsc(ticket.getId()).stream()
                .filter(thread -> thread.getId() != null && sameCompany(thread.getCompany(), actor)
                        && thread.getTicket() != null && Objects.equals(thread.getTicket().getId(), ticket.getId())
                        && Boolean.FALSE.equals(thread.getIsPrivate())
                        && (thread.getThreadType() == TicketThread.ThreadType.CUSTOMER_REPLY
                            && thread.getSenderType() == TicketThread.SenderType.CUSTOMER
                        || thread.getThreadType() == TicketThread.ThreadType.REPLY
                            && (thread.getSenderType() == TicketThread.SenderType.AGENT
                                || thread.getSenderType() == TicketThread.SenderType.CUSTOMER))).toList();
        Set<Long> visibleIds = new HashSet<>(visible.stream().map(TicketThread::getId).toList());
        List<TicketAttachment> files = attachments.findByTicketIdOrderByCreatedAtAsc(ticket.getId()).stream()
                .filter(file -> sameCompany(file.getCompany(), actor) && file.getTicket() != null
                        && Objects.equals(file.getTicket().getId(), ticket.getId()) && (file.getThread() == null
                        || sameCompany(file.getThread().getCompany(), actor) && file.getThread().getTicket() != null
                            && Objects.equals(file.getThread().getTicket().getId(), ticket.getId())
                            && visibleIds.contains(file.getThread().getId()))).toList();
        List<ThreadView> conversation = visible.stream().map(thread -> new ThreadView(thread.getId(), thread.getThreadType(),
                thread.getSenderType(), plain(thread.getFromName()), plain(thread.getFromEmail()), plain(thread.getBodyText()),
                HtmlSanitizer.clean(thread.getBodyHtml()), false, thread.getCreatedAt(), files.stream()
                    .filter(file -> file.getThread() != null && Objects.equals(file.getThread().getId(), thread.getId()))
                    .map(this::attachment).toList())).toList();
        Department department = ticket.getDepartment();
        return new PortalTicketDto(ticket.getId(), plain(ticket.getTicketNumber()), plain(ticket.getSubject()),
                plain(ticket.getDescriptionText()), ticket.getStatus(), ticket.getPriority(), ticket.getChannel(),
                ticket.getCreatedAt(), ticket.getUpdatedAt() == null ? ticket.getCreatedAt() : ticket.getUpdatedAt(),
                new ContactView(actor.contact().getId(), plain(actor.contact().getFirstName()),
                        plain(actor.contact().getLastName()), actor.email()), department == null ? null
                        : new DepartmentView(department.getId(), plain(department.getName()), plain(department.getCode())),
                conversation, files.stream().filter(file -> file.getThread() == null).map(this::attachment).toList(), notification);
    }

    private AttachmentView attachment(TicketAttachment file) {
        return new AttachmentView(file.getId(), plain(file.getFileName()), file.getFileSizeBytes(),
                plain(file.getContentType()), file.getCreatedAt());
    }

    private boolean sameCompany(Company company, Actor actor) {
        return company != null && Objects.equals(company.getId(), actor.company().getId());
    }

    private static String text(Object raw, int max, boolean required) {
        if (raw != null && !(raw instanceof String) || raw instanceof String value && value.length() > max) {
            throw error(HttpStatus.BAD_REQUEST, "Invalid field type or length");
        }
        String value = plain((String) raw).trim();
        if (value.length() > max || required && value.isBlank()) throw error(HttpStatus.BAD_REQUEST, "Invalid text length");
        return value;
    }

    private static String plain(String value) { return HtmlSanitizer.cleanToPlainText(value); }
    private static ResponseStatusException error(HttpStatus status, String message) { return new ResponseStatusException(status, message); }
    private record Actor(Company company, Contact contact, String email) { }
}
