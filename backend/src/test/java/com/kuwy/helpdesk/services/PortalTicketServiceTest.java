package com.kuwy.helpdesk.services;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kuwy.helpdesk.controllers.PublicPortalController.PublicTicketCreateDto;
import com.kuwy.helpdesk.dto.PortalTicketDto;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.Query;
import jakarta.persistence.TypedQuery;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;

import static com.kuwy.helpdesk.models.Ticket.TicketStatus.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class PortalTicketServiceTest {
    private static final String EMAIL = "person@example.invalid";
    private static final String NUMBER = "ACME-1001";
    private static final LocalDateTime DATE = LocalDateTime.of(2026, 11, 4, 7, 0);
    private final CompanyRepository companies = mock(CompanyRepository.class);
    private final ContactRepository contacts = mock(ContactRepository.class);
    private final DepartmentRepository departments = mock(DepartmentRepository.class);
    private final TicketThreadRepository threads = mock(TicketThreadRepository.class);
    private final TicketAttachmentRepository attachments = mock(TicketAttachmentRepository.class);
    private final SubscriptionService subscriptions = mock(SubscriptionService.class);
    private final AccountEmailService emails = mock(AccountEmailService.class);
    private final RateLimiterService limits = mock(RateLimiterService.class);
    private final EntityManager em = mock(EntityManager.class);
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
    private final List<TicketThread> history = new ArrayList<>();
    private TypedQuery<Ticket> query;
    private TypedQuery<Long> count;
    private Query sequence, update, feedback, insert;
    private PortalTicketService service;
    private Company company, foreign;
    private Contact contact;
    private Department department;
    private Ticket ticket;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        company = new Company(); company.setId(7L); company.setSubdomain("acme"); company.setCompanyCode("ACME");
        foreign = new Company(); foreign.setId(8L);
        contact = contact(11L, company); contact.setFirstName("Ada");
        department = new Department(); department.setId(5L); department.setCompany(company);
        ticket = new Ticket(); ticket.setId(21L); ticket.setCompany(company); ticket.setContact(contact);
        ticket.setDepartment(department); ticket.setTicketNumber(NUMBER); ticket.setSubject("Help"); ticket.setCreatedAt(DATE);
        TenantContext.setContext(7L, 11L, "CUSTOMER", EMAIL);
        when(companies.findBySubdomain("acme")).thenReturn(Optional.of(company));
        when(contacts.findById(11L)).thenReturn(Optional.of(contact));
        when(departments.findById(5L)).thenReturn(Optional.of(department));
        when(limits.allowTicketSubmission(anyString(), anyString())).thenReturn(true);
        query = mock(TypedQuery.class, RETURNS_SELF); count = mock(TypedQuery.class, RETURNS_SELF);
        when(em.createQuery(anyString(), eq(Ticket.class))).thenReturn(query);
        when(em.createQuery(anyString(), eq(Long.class))).thenReturn(count);
        when(query.getResultList()).thenAnswer(call -> List.of(ticket)); when(count.getSingleResult()).thenReturn(1L);
        sequence = mock(Query.class, RETURNS_SELF); update = mock(Query.class, RETURNS_SELF);
        feedback = mock(Query.class, RETURNS_SELF); insert = mock(Query.class, RETURNS_SELF);
        when(em.createNativeQuery(startsWith("select coalesce"))).thenReturn(sequence);
        when(em.createNativeQuery(startsWith("update tickets"))).thenReturn(update);
        when(em.createNativeQuery(startsWith("select rating"))).thenReturn(feedback);
        when(em.createNativeQuery(startsWith("insert into ticket_csat"))).thenReturn(insert);
        when(sequence.getSingleResult()).thenReturn(1000L);
        when(threads.findByTicketIdOrderByCreatedAtAsc(21L)).thenAnswer(call -> List.copyOf(history));
        when(threads.save(any())).thenAnswer(call -> {
            TicketThread thread = call.getArgument(0); thread.setId(100L + history.size()); thread.setCreatedAt(DATE);
            history.add(thread); return thread;
        });
        doAnswer(call -> { ticket = call.getArgument(0); ticket.setId(21L); ticket.setCreatedAt(DATE); return null; })
                .when(em).persist(any(Ticket.class));
        service = new PortalTicketService(companies, contacts, departments, threads, attachments,
                subscriptions, emails, limits, em, json);
    }

    @AfterEach void clear() { TenantContext.clear(); }

    @ParameterizedTest
    @ValueSource(strings = {"anonymous", "staff", "tenant", "zero", "blocked", "portal", "email", "contact-tenant", "missing"})
    void everyOperationRequiresTheLiveTenantCustomerBeforeLookingUpTickets(String invalid) {
        switch (invalid) {
            case "anonymous" -> TenantContext.clear();
            case "staff" -> TenantContext.setContext(7L, 11L, "SUPER_ADMIN", EMAIL);
            case "tenant" -> TenantContext.setContext(8L, 11L, "CUSTOMER", EMAIL);
            case "zero" -> TenantContext.setContext(7L, 0L, "CUSTOMER", EMAIL);
            case "blocked" -> contact.setIsBlocked(true);
            case "portal" -> contact.setIsPortalUser(false);
            case "email" -> contact.setEmail("changed@example.invalid");
            case "contact-tenant" -> contact.setCompany(foreign);
            case "missing" -> when(contacts.findById(11L)).thenReturn(Optional.empty());
        }
        for (Runnable operation : List.<Runnable>of(() -> service.create("acme", request(), "ip"),
                () -> service.list("acme", null, 0, 25, null, null), () -> service.export("acme", null, 0, 100),
                () -> service.detail("acme", NUMBER, null), () -> service.reply("acme", NUMBER, Map.of("reply", "hello")),
                () -> service.close("acme", NUMBER, null), () -> service.reopen("acme", NUMBER, null),
                () -> service.csat("acme", NUMBER, Map.of("rating", 5)))) denied(401, operation);
        verifyNoInteractions(em, threads, attachments, emails, subscriptions);
    }

    @ParameterizedTest
    @ValueSource(strings = {"owner", "company", "contact-company", "department", "spam"})
    void foreignOrHiddenTicketsAreNotFoundEvenIfAQueryReturnsAnUnsafeRow(String invalid) {
        switch (invalid) {
            case "owner" -> ticket.setContact(contact(12L, company)); // Same email is not ownership.
            case "company" -> ticket.setCompany(foreign);
            case "contact-company" -> ticket.setContact(contact(11L, foreign));
            case "department" -> department.setCompany(foreign);
            case "spam" -> ticket.setStatus(SPAM);
        }
        for (Runnable operation : List.<Runnable>of(() -> service.detail("acme", NUMBER, null),
                () -> service.reply("acme", NUMBER, Map.of("reply", "hello")), () -> service.close("acme", NUMBER, null),
                () -> service.reopen("acme", NUMBER, null), () -> service.csat("acme", NUMBER, Map.of("rating", 5)))) {
            denied(404, operation);
        }
        verify(query, atLeastOnce()).setParameter("companyId", 7L);
        verify(query, atLeastOnce()).setParameter("contactId", 11L);
        verifyNoInteractions(threads, attachments, emails, subscriptions);
    }

    @Test
    void guessedEmailsCannotSelectTheRequesterOrAnyTicket() {
        String guessed = "other@example.invalid";
        PublicTicketCreateDto dto = request(); dto.setRequesterEmail(guessed);
        denied(403, () -> service.create("acme", dto, "ip"));
        denied(403, () -> service.list("acme", guessed, 0, 25, null, null));
        denied(403, () -> service.detail("acme", NUMBER, guessed));
        denied(403, () -> service.reply("acme", NUMBER, Map.of("email", guessed, "reply", "hello")));
        denied(403, () -> service.csat("acme", NUMBER, Map.of("email", guessed, "rating", 5)));
        denied(403, () -> service.close("acme", NUMBER, guessed));
        denied(403, () -> service.reopen("acme", NUMBER, guessed));
        denied(403, () -> service.export("acme", guessed, 0, 100));
        verifyNoInteractions(em, threads, attachments); verify(contacts, never()).save(any());
    }

    @Test
    void serializationIsAnAllowlistAndRejectsPrivateSystemForeignThreadsAndAttachments() {
        TicketThread customer = thread(TicketThread.ThreadType.CUSTOMER_REPLY, TicketThread.SenderType.CUSTOMER, false);
        customer.setBodyHtml("<p onclick='bad()'>Public</p><script>secret</script>"); customer.setCreatedAt(null);
        thread(TicketThread.ThreadType.REPLY, TicketThread.SenderType.AGENT, false);
        TicketThread note = thread(TicketThread.ThreadType.PRIVATE_NOTE, TicketThread.SenderType.AGENT, false);
        thread(TicketThread.ThreadType.SYSTEM, TicketThread.SenderType.CUSTOMER, false);
        thread(TicketThread.ThreadType.REPLY, TicketThread.SenderType.SYSTEM, false);
        thread(TicketThread.ThreadType.FORWARD, TicketThread.SenderType.AGENT, false);
        thread(TicketThread.ThreadType.REPLY, TicketThread.SenderType.AGENT, true);
        thread(TicketThread.ThreadType.CUSTOMER_REPLY, TicketThread.SenderType.CUSTOMER, null);
        thread(TicketThread.ThreadType.REPLY, TicketThread.SenderType.AGENT, false).setCompany(foreign);
        TicketAttachment own = file(1L, customer), top = file(2L, null), hidden = file(3L, note), other = file(4L, customer);
        other.setCompany(foreign);
        when(attachments.findByTicketIdOrderByCreatedAtAsc(21L)).thenReturn(List.of(own, top, hidden, other));
        ticket.setAssignedAgent(new User()); ticket.setInternetMessageId("internal-secret"); company.setSettingsJson("internal-secret");
        var dto = service.detail("ACME", NUMBER, " PERSON@EXAMPLE.INVALID ");
        JsonNode tree = json.valueToTree(dto);
        assertEquals(Set.of("id", "ticketNumber", "subject", "descriptionText", "status", "priority", "channel",
                "createdAt", "updatedAt", "contact", "department", "threads", "attachments"), keys(tree));
        assertEquals(Set.of("id", "firstName", "lastName", "email"), keys(tree.get("contact")));
        assertEquals(Set.of("id", "name", "code"), keys(tree.get("department")));
        assertEquals(2, dto.threads().size()); assertFalse(dto.threads().get(0).isPrivate());
        assertEquals(Set.of("id", "threadType", "senderType", "fromName", "fromEmail", "bodyText", "bodyHtml",
                "isPrivate", "createdAt", "attachments"), keys(tree.get("threads").get(0)));
        assertEquals(Set.of("id", "fileName", "fileSizeBytes", "contentType", "createdAt"), keys(tree.get("attachments").get(0)));
        assertEquals(List.of(1L), dto.threads().get(0).attachments().stream().map(PortalTicketDto.AttachmentView::id).toList());
        assertEquals(List.of(2L), dto.attachments().stream().map(PortalTicketDto.AttachmentView::id).toList());
        assertFalse(tree.toString().contains("internal-secret")); assertFalse(tree.toString().contains("onclick"));
        assertFalse(tree.toString().contains("<script")); assertNull(dto.threads().get(0).createdAt());
    }

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void creationRejectsForeignOrInactiveDepartmentsBeforeAnyInsert(boolean foreignDepartment) {
        if (foreignDepartment) department.setCompany(foreign); else department.setIsActive(false);
        denied(400, () -> service.create("acme", request(), "ip"));
        verify(em, never()).persist(any()); verifyNoInteractions(threads, emails); verify(contacts, never()).save(any());
    }

    @Test
    void requiredServerValidationRateAndQuotaFailuresDoNotPersistFakeSuccess() {
        denied(400, () -> service.create("acme", null, "ip"));
        PublicTicketCreateDto dto = request(); dto.setSubject("x".repeat(501));
        denied(400, () -> service.create("acme", dto, "ip")); dto.setSubject("<script>bad()</script>");
        denied(400, () -> service.create("acme", dto, "ip"));
        when(limits.allowTicketSubmission(anyString(), anyString())).thenReturn(false);
        denied(429, () -> service.create("acme", request(), "ip"));
        when(limits.allowTicketSubmission(anyString(), anyString())).thenReturn(true);
        doThrow(new IllegalStateException()).when(subscriptions).assertCanCreateTicket(7L);
        denied(402, () -> service.create("acme", request(), "ip")); verify(em, never()).persist(any());
    }

    @Test
    void realCreationLocksCompanyBeforeQuotaAndSequenceAndUsesOnlyTheCurrentIdentity() {
        PublicTicketCreateDto dto = request(); dto.setRequesterName("Forged Name");
        var result = service.create("acme", dto, "198.51.100.2");
        assertEquals(NUMBER, result.ticketNumber()); assertEquals("not_configured", result.emailNotification());
        assertEquals(OPEN, result.status()); assertEquals(Ticket.TicketPriority.MEDIUM, result.priority());
        assertEquals(Ticket.TicketChannel.WEB_PORTAL, result.channel()); assertEquals(1, result.threads().size());
        assertSame(contact, ticket.getContact()); assertSame(contact, history.get(0).getSenderContact());
        assertEquals("Ada", history.get(0).getFromName()); assertEquals(EMAIL, history.get(0).getFromEmail());
        assertFalse(ticket.getDescriptionHtml().contains("onerror")); assertFalse(history.get(0).getBodyHtml().contains("<script"));
        assertEquals("CUSTOMER", TenantContext.getUserRole()); verify(contacts, never()).save(any());
        var order = inOrder(em, subscriptions, threads);
        order.verify(em).refresh(company, LockModeType.PESSIMISTIC_WRITE);
        order.verify(subscriptions).assertCanCreateTicket(7L); order.verify(em).createNativeQuery(startsWith("select coalesce"));
        order.verify(em).persist(ticket); order.verify(threads).save(any()); order.verify(em).flush();
        verify(limits).allowTicketSubmission("198.51.100.2", "7:11"); verify(emails, never()).enqueue(any(), any(), any(), any(), any());
    }

    @Test
    void configuredEmailIsQueuedWithAStructuralKeyAndFailureRollsBackTheServiceTransaction() {
        when(emails.isReady()).thenReturn(true);
        when(emails.enqueue(eq(7L), eq(EMAIL), anyString(), anyString(), eq("portal-ticket:7:21:created"))).thenReturn("receipt");
        assertEquals("queued", service.create("acme", request(), "ip").emailNotification());
        var order = inOrder(em, emails); order.verify(em).flush();
        order.verify(emails).enqueue(eq(7L), eq(EMAIL), anyString(), argThat(html -> !html.contains("script")), eq("portal-ticket:7:21:created"));
        when(emails.enqueue(any(), any(), any(), any(), any())).thenThrow(new IllegalStateException("private failure"));
        Transactions tx = new Transactions(); ProxyFactory factory = new ProxyFactory(service);
        factory.addAdvice(new TransactionInterceptor(tx, new AnnotationTransactionAttributeSource()));
        PortalTicketService transactional = (PortalTicketService) factory.getProxy();
        denied(503, () -> transactional.create("acme", request(), "ip"));
        assertEquals(1, tx.rollbacks); assertEquals(0, tx.commits);
    }

    @ParameterizedTest @EnumSource(value = Ticket.TicketStatus.class, names = {"OPEN", "WAITING_ON_CUSTOMER", "WAITING_ON_THIRD_PARTY", "RESOLVED", "CLOSED"})
    void replyIsPublicSanitizedAndReopensWaitingResolvedOrClosedTickets(Ticket.TicketStatus status) {
        ticket.setStatus(status); ticket.setResolvedAt(DATE);
        var result = service.reply("acme", NUMBER, Map.of("reply", "<p onclick='bad()'>Hello</p><script>bad()</script>"));
        assertEquals(OPEN, result.status()); assertNull(ticket.getResolvedAt()); assertNotNull(result.updatedAt());
        assertEquals(1, result.threads().size()); assertEquals(TicketThread.ThreadType.CUSTOMER_REPLY, result.threads().get(0).threadType());
        assertFalse(result.threads().get(0).bodyHtml().contains("onclick")); assertEquals("Hello", result.threads().get(0).bodyText());
        verify(query).setLockMode(LockModeType.PESSIMISTIC_WRITE); verify(update).executeUpdate();
    }

    @Test
    void statusTransitionsAreIdempotentAndSubscriptionOrInactiveCompanyBlocksWrites() {
        service.close("acme", NUMBER, null); LocalDateTime resolved = ticket.getResolvedAt();
        service.close("acme", NUMBER, null); assertEquals(resolved, ticket.getResolvedAt());
        service.reopen("acme", NUMBER, null); service.reopen("acme", NUMBER, null);
        assertNull(ticket.getResolvedAt()); assertEquals(OPEN, ticket.getStatus()); verify(update, times(2)).executeUpdate();
        when(subscriptions.isWorkspaceLocked(7L)).thenReturn(true);
        denied(402, () -> service.reply("acme", NUMBER, Map.of("reply", "no write")));
        company.setStatus(Company.CompanyStatus.INACTIVE); denied(403, () -> service.close("acme", NUMBER, null));
        verify(threads, never()).save(any());
    }

    @Test
    void feedbackIsPersistedOnceAndReplayReturnsTheOriginalVoteWithoutSystemNotes() {
        ticket.setStatus(RESOLVED);
        var first = service.csat("acme", NUMBER, Map.of("rating", 4, "comment", "<b>Good</b><script>bad()</script>"));
        verify(insert).setParameter("companyId", 7L); verify(insert).setParameter("ticketId", 21L);
        verify(insert).setParameter("contactId", 11L); verify(insert).setParameter("comment", "Good");
        when(feedback.getResultList()).thenReturn(Collections.singletonList(new Object[]{4, "Good", Timestamp.valueOf(first.createdAt())}));
        assertEquals(first, service.csat("acme", NUMBER, Map.of("rating", 1, "comment", "replacement")));
        verify(insert).executeUpdate(); verifyNoInteractions(threads, attachments, emails);
        verify(query, times(2)).setLockMode(LockModeType.PESSIMISTIC_WRITE);
    }

    @ParameterizedTest @ValueSource(ints = {-1, 0, 6, Integer.MAX_VALUE})
    void ratingBoundsAndTypesAreValidatedBeforeTicketLookup(int rating) {
        denied(400, () -> service.csat("acme", NUMBER, Map.of("rating", rating)));
        denied(400, () -> service.csat("acme", NUMBER, Map.of("rating", "5")));
        denied(400, () -> service.csat("acme", NUMBER, Map.of("rating", 4.5)));
        denied(400, () -> service.csat("acme", NUMBER, Map.of())); verifyNoInteractions(em);
    }

    @Test
    void disabledFeedbackAndUnresolvedTicketsCannotCreateVotes() {
        denied(409, () -> service.csat("acme", NUMBER, Map.of("rating", 5)));
        ticket.setStatus(CLOSED); company.setSettingsJson("{\"csat\":{\"enabled\":false}}");
        denied(403, () -> service.csat("acme", NUMBER, Map.of("rating", 5)));
        verify(em, never()).createNativeQuery(anyString());
    }

    @Test
    void searchAndStatusAreBoundInBothDatabaseQueriesBeforePaginationAndExportIsCustomerScoped() {
        when(count.getSingleResult()).thenReturn(80L);
        var result = service.list("acme", null, 2, 25, "%_!", "open");
        assertEquals(80, result.getTotalElements()); assertEquals(21L, result.getContent().get(0).id());
        verify(em).createQuery(argThat(sql -> sql.contains("t.contact.id = :contactId") && sql.contains("t.company.id = :companyId")
                && sql.contains("t.status in :statuses") && sql.contains("lower(t.subject) like :q")), eq(Long.class));
        verify(count).setParameter("statuses", List.of(OPEN)); verify(count).setParameter("q", "%!%!_!!%");
        var order = inOrder(count, query); order.verify(count).getSingleResult();
        order.verify(query).setParameter("statuses", List.of(OPEN)); order.verify(query).setParameter("q", "%!%!_!!%");
        order.verify(query).setFirstResult(50); order.verify(query).setMaxResults(25); order.verify(query).getResultList();
        when(count.getSingleResult()).thenReturn(1L);
        var export = service.export("acme", null, 0, 100);
        assertEquals("customer", export.get("scope")); assertEquals(1L, export.get("totalTickets"));
        assertTrue(((List<?>) export.get("tickets")).get(0) instanceof PortalTicketDto);
        verify(count, times(2)).setParameter("contactId", 11L); verify(query, times(2)).setParameter("companyId", 7L);
    }

    @Test
    void invalidPagesHiddenViewsAndMalformedRepliesAreRejected() {
        denied(400, () -> service.list("acme", null, -1, 25, null, null));
        denied(400, () -> service.list("acme", null, 0, 101, null, null));
        denied(400, () -> service.list("acme", null, 0, 25, "x".repeat(251), null));
        denied(400, () -> service.list("acme", null, 0, 25, null, "SPAM"));
        denied(400, () -> service.reply("acme", NUMBER, Map.of("reply", 42)));
        denied(400, () -> service.reply("acme", NUMBER, Map.of("reply", "x".repeat(100_001))));
        denied(400, () -> service.csat("acme", NUMBER, Map.of("rating", 5, "comment", "&".repeat(2001))));
        denied(400, () -> service.reply("acme", NUMBER, Map.of("reply", "hello", "isPrivate", true)));
        verifyNoInteractions(em);
    }

    private PublicTicketCreateDto request() {
        PublicTicketCreateDto dto = new PublicTicketCreateDto(); dto.setSubject("Help"); dto.setDepartmentId(5L);
        dto.setDescription("<p>Public body</p><img src='x' onerror='bad()'><script>bad()</script>"); return dto;
    }
    private Contact contact(Long id, Company owner) {
        Contact result = new Contact(); result.setId(id); result.setCompany(owner); result.setEmail(EMAIL); result.setIsPortalUser(true); return result;
    }
    private TicketThread thread(TicketThread.ThreadType type, TicketThread.SenderType sender, Boolean privateFlag) {
        TicketThread result = new TicketThread(); result.setId(100L + history.size()); result.setTicket(ticket); result.setCompany(company);
        result.setThreadType(type); result.setSenderType(sender); result.setIsPrivate(privateFlag); history.add(result); return result;
    }
    private TicketAttachment file(Long id, TicketThread thread) {
        TicketAttachment result = new TicketAttachment(); result.setId(id); result.setTicket(ticket); result.setCompany(company);
        result.setThread(thread); result.setFileName("public.pdf"); result.setStoragePath("internal-secret"); return result;
    }
    private Set<String> keys(JsonNode node) { Set<String> keys = new HashSet<>(); node.fieldNames().forEachRemaining(keys::add); return keys; }
    private void denied(int status, Runnable operation) { assertEquals(status, assertThrows(ResponseStatusException.class, operation::run).getStatusCode().value()); }
    private static class Transactions extends AbstractPlatformTransactionManager {
        int commits, rollbacks;
        protected Object doGetTransaction() { return new Object(); }
        protected void doBegin(Object transaction, TransactionDefinition definition) { assertEquals(TransactionDefinition.ISOLATION_READ_COMMITTED, definition.getIsolationLevel()); }
        protected void doCommit(DefaultTransactionStatus status) { commits++; }
        protected void doRollback(DefaultTransactionStatus status) { rollbacks++; }
    }
}
