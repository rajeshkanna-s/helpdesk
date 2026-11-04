package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.BulkUpdateDto;
import com.kuwy.helpdesk.dto.ScenarioExecuteDto;
import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.TicketReplyDto;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import com.kuwy.helpdesk.tenant.TenantContext;
import com.kuwy.helpdesk.util.HtmlSanitizer;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

@Service
@RequiredArgsConstructor
public class TicketService {

    public static final int MAX_PAGE_SIZE = 100;
    public static final int MAX_PAGE_NUMBER = 100_000;
    private static final Set<String> SORT_FIELDS = Set.of("createdAt", "updatedAt", "priority", "status");

    private final TicketRepository ticketRepository;
    private final TicketThreadRepository threadRepository;
    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final ContactRepository contactRepository;
    private final UserRepository userRepository;
    private final TicketAttachmentRepository attachmentRepository;

    @Transactional(readOnly = true)
    public Page<Ticket> getCompanyTickets(Long companyId, String status, Long agentId, Pageable pageable) {
        requireActor(false);
        Long targetCompanyId = resolveCompanyId(companyId);
        Company company = companyRepository.findById(targetCompanyId)
                .orElseThrow(() -> new IllegalArgumentException("Company not found."));
        assertCompanyAccess(company);
        if (pageable == null || pageable.isUnpaged() || pageable.getPageNumber() < 0 || pageable.getPageNumber() > MAX_PAGE_NUMBER
                || pageable.getPageSize() < 1 || pageable.getPageSize() > MAX_PAGE_SIZE
                || pageable.getSort().stream().anyMatch(order -> !SORT_FIELDS.contains(order.getProperty()))) {
            throw new IllegalArgumentException("Invalid ticket page, page size or sort field.");
        }
        if (agentId != null) {
            requireAssignee(agentId, targetCompanyId);
        }
        Ticket.TicketStatus ticketStatus = parseStatus(status);
        Page<Ticket> tickets;
        if (ticketStatus != null) {
            tickets = ticketRepository.findByCompanyIdAndStatus(targetCompanyId, ticketStatus, pageable);
        } else if (agentId != null) {
            tickets = ticketRepository.findByCompanyIdAndAssignedAgentId(targetCompanyId, agentId, pageable);
        } else {
            tickets = ticketRepository.findByCompanyId(targetCompanyId, pageable);
        }
        tickets.forEach(ticket -> {
            assertTicketAccess(ticket);
            assertOwnedBy(ticket.getCompany(), targetCompanyId);
        });
        return tickets;
    }

    @Transactional(readOnly = true)
    public Ticket getTicketById(Long id) {
        requireActor(false);
        Ticket ticket = findAccessibleTicket(id);
        List<TicketThread> threads = loadTicketThreads(ticket);
        ticket.setThreads(threads);
        return ticket;
    }

    @Transactional(readOnly = true)
    public List<TicketThread> getTicketThreads(Long ticketId) {
        requireActor(false);
        return loadTicketThreads(findAccessibleTicket(ticketId));
    }

    private List<TicketThread> loadTicketThreads(Ticket ticket) {
        Long ticketId = ticket.getId();
        List<TicketThread> threads = threadRepository.findByTicketIdOrderByCreatedAtAsc(ticketId);
        for (TicketThread thread : threads) {
            thread.setBodyHtml(HtmlSanitizer.clean(thread.getBodyHtml()));
            assertOwnedBy(thread.getCompany(), ticket.getCompany().getId());
            if (thread.getTicket() == null || !Objects.equals(thread.getTicket().getId(), ticketId)) {
                throw new SecurityException("Thread does not belong to this ticket.");
            }
        }
        List<TicketAttachment> ticketLevelAtts = attachmentRepository.findByTicketIdAndThreadIsNullOrderByCreatedAtAsc(ticketId);

        for (int i = 0; i < threads.size(); i++) {
            TicketThread thread = threads.get(i);
            List<TicketAttachment> atts = attachmentRepository.findByThreadIdOrderByCreatedAtAsc(thread.getId());
            
            // If first thread and there are ticket-level attachments from ticket creation, include them
            if (i == 0 && ticketLevelAtts != null && !ticketLevelAtts.isEmpty()) {
                atts = new java.util.ArrayList<>(atts);
                atts.addAll(ticketLevelAtts);
            }

            for (TicketAttachment att : atts) {
                if (att.getStorageType() == TicketAttachment.StorageType.CLOUDINARY && att.getStoragePath().startsWith("http")) {
                    att.setDownloadUrl(att.getStoragePath());
                    att.setPreviewUrl(att.getStoragePath());
                } else {
                    att.setDownloadUrl("/api/v1/attachments/" + att.getId() + "/download");
                    att.setPreviewUrl("/api/v1/attachments/" + att.getId() + "/preview");
                }
            }
            thread.setAttachments(atts);
        }
        return threads;
    }

    @Transactional
    public Ticket createTicket(TicketCreateDto dto) {
        requireActor(true);
        if (dto == null) throw new IllegalArgumentException("Ticket request is required.");
        dto.validate();
        Long companyId = resolveCompanyId(dto.getCompanyId());
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new IllegalArgumentException("Company not found."));
        assertCompanyAccess(company);
        Department department = requireDepartment(dto.getDepartmentId(), companyId);
        User assignee = dto.getAssignedAgentId() == null ? null : requireAssignee(dto.getAssignedAgentId(), companyId);
        List<User> eligibleAgents = dto.getAssignedAgentId() == null
                ? userRepository.findByCompanyIdAndIsActiveTrue(companyId).stream()
                    .filter(user -> isEligibleAssignee(user, companyId)).toList()
                : List.of();
        Contact contact = contactRepository.findByCompanyIdAndEmail(companyId, dto.getRequesterEmail()).orElse(null);
        if (contact != null) assertContactAccess(contact, companyId);

        // Generate Ticket Number (e.g. KUWY-1009)
        Long maxSeq = ticketRepository.findMaxTicketSequenceForCompany(company.getId());
        long nextSeq = (maxSeq != null && maxSeq >= 1000 ? maxSeq : 1000) + 1;
        String ticketNumber = company.getCompanyCode() + "-" + nextSeq;

        if (assignee == null && !eligibleAgents.isEmpty()) {
            assignee = eligibleAgents.get((int) (nextSeq % eligibleAgents.size()));
        }

        // Resolve every supplied reference before creating even the customer contact.
        if (contact == null) {
            contact = new Contact();
            contact.setCompany(company);
            contact.setEmail(dto.getRequesterEmail());
            String requesterName = dto.getRequesterName() == null || dto.getRequesterName().isBlank()
                    ? dto.getRequesterEmail() : dto.getRequesterName();
            contact.setFirstName(requesterName.substring(0, Math.min(requesterName.length(), 100)));
            contact = contactRepository.save(contact);
        }

        Ticket ticket = new Ticket();
        ticket.setCompany(company);
        ticket.setTicketNumber(ticketNumber);
        ticket.setDepartment(department);
        ticket.setContact(contact);
        String safeDescriptionHtml = HtmlSanitizer.clean(dto.getDescription());
        if (!safeDescriptionHtml.startsWith("<p>")) {
            safeDescriptionHtml = "<p>" + safeDescriptionHtml + "</p>";
        }
        ticket.setSubject(HtmlSanitizer.cleanToPlainText(dto.getSubject()));
        ticket.setDescriptionText(HtmlSanitizer.cleanToPlainText(dto.getDescription()));
        ticket.setDescriptionHtml(safeDescriptionHtml);
        ticket.setPriority(dto.getPriority() != null ? dto.getPriority() : Ticket.TicketPriority.MEDIUM);
        ticket.setStatus(Ticket.TicketStatus.OPEN);
        ticket.setChannel(dto.getChannel() != null ? dto.getChannel() : Ticket.TicketChannel.WEB_PORTAL);
        ticket.setFirstResponseDueAt(LocalDateTime.now().plusHours(4)); // Default 4-hour SLA

        ticket.setAssignedAgent(assignee);

        Ticket savedTicket = ticketRepository.save(ticket);

        // Add initial conversation thread
        TicketThread initialThread = new TicketThread();
        initialThread.setCompany(company);
        initialThread.setTicket(savedTicket);
        initialThread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
        initialThread.setSenderType(TicketThread.SenderType.CUSTOMER);
        initialThread.setSenderContact(contact);
        initialThread.setFromEmail(dto.getRequesterEmail());
        initialThread.setFromName(contact.getFirstName());
        initialThread.setSubject(ticket.getSubject());
        initialThread.setBodyText(ticket.getDescriptionText());
        initialThread.setBodyHtml(safeDescriptionHtml);
        initialThread.setIsPrivate(false);
        threadRepository.save(initialThread);

        return savedTicket;
    }

    @Transactional
    public TicketThread addReply(Long ticketId, TicketReplyDto dto) {
        User actor = requireActor(true);
        if (dto == null) throw new IllegalArgumentException("Reply request is required.");
        requireBody(dto.getBody());
        Ticket ticket = findAccessibleTicket(ticketId);

        TicketThread thread = new TicketThread();
        thread.setCompany(ticket.getCompany());
        thread.setTicket(ticket);
        thread.setSubject(replySubject(ticket));
        String safeReplyBody = HtmlSanitizer.clean(dto.getBody());
        if (!safeReplyBody.startsWith("<p>")) {
            safeReplyBody = "<p>" + safeReplyBody + "</p>";
        }
        thread.setBodyText(HtmlSanitizer.cleanToPlainText(dto.getBody()));
        thread.setBodyHtml(safeReplyBody);
        thread.setIsPrivate(Boolean.TRUE.equals(dto.getIsPrivate()));
        setAuthor(thread, actor);

        if (Boolean.TRUE.equals(dto.getIsPrivate())) {
            thread.setThreadType(TicketThread.ThreadType.PRIVATE_NOTE);
        } else {
            thread.setThreadType(TicketThread.ThreadType.REPLY);
            thread.setToEmails(ticket.getContact().getEmail());

            // Update ticket first response timestamp if not already set
            if (ticket.getFirstResponseAt() == null) {
                ticket.setFirstResponseAt(LocalDateTime.now());
            }

            // Set ticket to Waiting on Customer or In Progress
            if (ticket.getStatus() == Ticket.TicketStatus.OPEN) {
                ticket.setStatus(Ticket.TicketStatus.WAITING_ON_CUSTOMER);
            }
            ticketRepository.save(ticket);
        }

        return threadRepository.save(thread);
    }

    @Transactional
    public Ticket updateStatus(Long ticketId, Ticket.TicketStatus newStatus) {
        requireActor(true);
        if (newStatus == null) throw new IllegalArgumentException("Ticket status is required.");
        Ticket ticket = findAccessibleTicket(ticketId);
        ticket.setStatus(newStatus);
        if (newStatus == Ticket.TicketStatus.RESOLVED) {
            ticket.setResolvedAt(LocalDateTime.now());
        }
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket updatePriority(Long ticketId, Ticket.TicketPriority newPriority) {
        requireActor(true);
        if (newPriority == null) throw new IllegalArgumentException("Ticket priority is required.");
        Ticket ticket = findAccessibleTicket(ticketId);
        ticket.setPriority(newPriority);
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket updateDepartment(Long ticketId, Long departmentId) {
        requireActor(true);
        Ticket ticket = findAccessibleTicket(ticketId);
        Department department = requireDepartment(departmentId, ticket.getCompany().getId());
        ticket.setDepartment(department);
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket assignAgent(Long ticketId, Long agentId) {
        requireActor(true);
        Ticket ticket = findAccessibleTicket(ticketId);
        User agent = requireAssignee(agentId, ticket.getCompany().getId());
        ticket.setAssignedAgent(agent);
        if (ticket.getStatus() == Ticket.TicketStatus.OPEN) {
            ticket.setStatus(Ticket.TicketStatus.IN_PROGRESS);
        }
        return ticketRepository.save(ticket);
    }

    @Transactional
    public void bulkUpdate(BulkUpdateDto dto) {
        requireActor(true);
        if (dto == null) throw new IllegalArgumentException("Bulk update request is required.");
        dto.validate();
        Ticket.TicketStatus status = parseStatus(dto.getStatus());
        Ticket.TicketPriority priority = parsePriority(dto.getPriority());
        List<Long> ids = List.copyOf(dto.getTicketIds());
        List<Ticket> tickets = ticketRepository.findAllById(ids);
        Set<Long> remainingIds = new HashSet<>(ids);
        if (tickets.size() != ids.size()) {
            throw new IllegalArgumentException("One or more tickets were not found.");
        }
        Long companyId = null;
        for (Ticket ticket : tickets) {
            if (!remainingIds.remove(ticket.getId())) {
                throw new IllegalArgumentException("One or more tickets were not found.");
            }
            assertTicketAccess(ticket);
            if (companyId == null) companyId = ticket.getCompany().getId();
            else if (!companyId.equals(ticket.getCompany().getId())) {
                throw new SecurityException("Bulk tickets must belong to one workspace.");
            }
        }
        User agent = dto.getAgentId() == null ? null : requireAssignee(dto.getAgentId(), companyId);
        Department dept = dto.getDepartmentId() == null ? null : requireDepartment(dto.getDepartmentId(), companyId);

        // No managed entity is changed until every ticket, enum and replacement has passed validation.
        LocalDateTime resolvedAt = LocalDateTime.now();
        for (Ticket t : tickets) {
            if (status != null) {
                t.setStatus(status);
                if (status == Ticket.TicketStatus.RESOLVED) {
                    t.setResolvedAt(resolvedAt);
                }
            }
            if (priority != null) {
                t.setPriority(priority);
            }
            if (agent != null) {
                t.setAssignedAgent(agent);
            }
            if (dept != null) {
                t.setDepartment(dept);
            }
        }
        ticketRepository.saveAll(tickets);
    }

    @Transactional
    public Ticket executeScenario(Long ticketId, ScenarioExecuteDto dto) {
        User actor = requireActor(true);
        if (dto == null || dto.getScenarioKey() == null || dto.getScenarioKey().isBlank()
                || dto.getScenarioKey().length() > 64
                || (dto.getCustomNote() != null && dto.getCustomNote().length() > TicketCreateDto.MAX_BODY_LENGTH)) {
            throw new IllegalArgumentException("A valid scenario key and bounded note are required.");
        }
        Ticket ticket = findAccessibleTicket(ticketId);

        String noteText = "";
        String replyText = "";
        boolean isReply = false;
        Ticket.TicketStatus status = ticket.getStatus();
        Ticket.TicketPriority priority = ticket.getPriority();
        boolean resolved = false;
        String companyName = ticket.getCompany() != null && ticket.getCompany().getName() != null
                ? ticket.getCompany().getName() : "Support Team";

        switch (dto.getScenarioKey().trim()) {
            case "KYC_RESUBMIT":
                status = Ticket.TicketStatus.WAITING_ON_CUSTOMER;
                priority = Ticket.TicketPriority.HIGH;
                replyText = "Hello " + ticket.getContact().getFirstName() + ",\n\nWe have reviewed your request and noticed a verification discrepancy with your submitted documents. Please re-upload clear copies through our portal.\n\nThank you,\n" + companyName;
                isReply = true;
                break;
            case "ESCALATE_LEAD":
                priority = Ticket.TicketPriority.URGENT;
                status = Ticket.TicketStatus.IN_PROGRESS;
                noteText = "Scenario Macro Executed: Escalated to Senior Support Lead for critical review. Turnaround required within 2 hours.";
                break;
            case "LOAN_APPROVED":
                status = Ticket.TicketStatus.RESOLVED;
                resolved = true;
                replyText = "Dear " + ticket.getContact().getFirstName() + ",\n\nCongratulations! Your application and request have been successfully approved by the operations team.\n\nRegards,\n" + companyName;
                isReply = true;
                break;
            case "CUSTOMER_INACTIVE":
                status = Ticket.TicketStatus.CLOSED;
                resolved = true;
                noteText = "Scenario Macro Executed: Closed ticket due to customer non-response after follow-up period.";
                break;
            default:
                requireBody(dto.getCustomNote());
                noteText = dto.getCustomNote();
                break;
        }

        ticket.setStatus(status);
        ticket.setPriority(priority);
        if (resolved) ticket.setResolvedAt(LocalDateTime.now());
        if (isReply && ticket.getFirstResponseAt() == null) ticket.setFirstResponseAt(LocalDateTime.now());
        Ticket saved = ticketRepository.save(ticket);

        TicketThread thread = new TicketThread();
        thread.setCompany(ticket.getCompany());
        thread.setTicket(saved);
        thread.setThreadType(isReply ? TicketThread.ThreadType.REPLY : TicketThread.ThreadType.PRIVATE_NOTE);
        setAuthor(thread, actor);
        if (isReply) thread.setToEmails(ticket.getContact().getEmail());
        thread.setSubject(isReply ? replySubject(ticket) : "Internal Note: Scenario Executed");
        thread.setBodyText(isReply ? replyText : noteText);
        String rawBody = isReply ? replyText.replace("\n", "<br/>") : noteText;
        String safeBody = HtmlSanitizer.clean(rawBody);
        if (!safeBody.startsWith("<p>")) {
            safeBody = "<p>" + safeBody + "</p>";
        }
        thread.setBodyHtml(safeBody);
        thread.setIsPrivate(!isReply);
        threadRepository.save(thread);

        return saved;
    }

    private User requireActor(boolean writable) {
        Long userId = TenantContext.requireUserId();
        User actor = userRepository.findById(userId)
                .orElseThrow(() -> new SecurityException("An active staff identity is required."));
        Role role = actor.getRole();
        if (!isActiveUser(actor) || role == null || role.getRoleType() == null
                || role.getRoleType() == Role.RoleType.CUSTOMER
                || !Objects.equals(actor.getId(), userId)
                || !role.getRoleType().name().equals(TenantContext.getUserRole())
                || actor.getEmail() == null || !actor.getEmail().equalsIgnoreCase(TenantContext.getUserEmail())) {
            throw new SecurityException("An active staff identity is required.");
        }
        if (role.getRoleType() != Role.RoleType.SUPER_ADMIN) {
            assertOwnedBy(actor.getCompany(), TenantContext.getCompanyId());
            assertCompanyAccess(actor.getCompany());
        }
        if (role.getCompany() != null) {
            if (actor.getCompany() == null) throw new SecurityException("Invalid staff role ownership.");
            assertOwnedBy(role.getCompany(), actor.getCompany().getId());
        }
        if (writable && role.getRoleType() == Role.RoleType.LIGHT_AGENT) {
            throw new SecurityException("Light agents have read-only ticket access.");
        }
        return actor;
    }

    private Long resolveCompanyId(Long requestedCompanyId) {
        Long companyId = requestedCompanyId != null ? requestedCompanyId : TenantContext.getCompanyId();
        requirePositiveId(companyId);
        TenantContext.assertAccessTo(companyId);
        return companyId;
    }

    private Ticket findAccessibleTicket(Long ticketId) {
        requirePositiveId(ticketId);
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        assertTicketAccess(ticket);
        return ticket;
    }

    private void assertTicketAccess(Ticket ticket) {
        assertCompanyAccess(ticket.getCompany());
        Long companyId = ticket.getCompany().getId();
        if (ticket.getDepartment() != null) assertOwnedBy(ticket.getDepartment().getCompany(), companyId);
        if (ticket.getAssignedAgent() != null) assertOwnedBy(ticket.getAssignedAgent().getCompany(), companyId);
        assertContactAccess(ticket.getContact(), companyId);
    }

    private void assertCompanyAccess(Company company) {
        if (company == null) throw new SecurityException("Workspace access is not permitted.");
        TenantContext.assertAccessTo(company.getId());
        if (company.getStatus() != Company.CompanyStatus.ACTIVE && company.getStatus() != Company.CompanyStatus.TRIAL) {
            throw new SecurityException("Workspace is not active.");
        }
    }

    private void assertContactAccess(Contact contact, Long companyId) {
        if (contact == null) throw new SecurityException("Ticket contact is not available.");
        assertOwnedBy(contact.getCompany(), companyId);
        if (contact.getAccount() != null) assertOwnedBy(contact.getAccount().getCompany(), companyId);
    }

    private Department requireDepartment(Long departmentId, Long companyId) {
        requirePositiveId(departmentId);
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new IllegalArgumentException("Department not found."));
        assertOwnedBy(department.getCompany(), companyId);
        if (!Boolean.TRUE.equals(department.getIsActive())) {
            throw new IllegalArgumentException("Department must be active.");
        }
        return department;
    }

    private User requireAssignee(Long agentId, Long companyId) {
        requirePositiveId(agentId);
        User agent = userRepository.findById(agentId)
                .orElseThrow(() -> new IllegalArgumentException("Assignee not found."));
        assertOwnedBy(agent.getCompany(), companyId);
        if (!isEligibleAssignee(agent, companyId)) {
            throw new IllegalArgumentException("Assignee must be an active company administrator, team lead or agent.");
        }
        return agent;
    }

    private boolean isEligibleAssignee(User user, Long companyId) {
        if (!isActiveUser(user) || user.getCompany() == null || !Objects.equals(user.getCompany().getId(), companyId)
                || user.getRole() == null || user.getRole().getRoleType() == null) return false;
        Role role = user.getRole();
        if (role.getCompany() != null && !Objects.equals(role.getCompany().getId(), companyId)) return false;
        return role.getRoleType() == Role.RoleType.COMPANY_ADMIN || role.getRoleType() == Role.RoleType.TEAM_LEAD
                || role.getRoleType() == Role.RoleType.AGENT;
    }

    private boolean isActiveUser(User user) {
        return user != null && Boolean.TRUE.equals(user.getIsActive()) && "ACTIVE".equalsIgnoreCase(user.getStatus());
    }

    private void assertOwnedBy(Company company, Long companyId) {
        if (company == null || companyId == null || !companyId.equals(company.getId())) {
            throw new SecurityException("Referenced record does not belong to this workspace.");
        }
    }

    private void requirePositiveId(Long id) {
        if (id == null || id <= 0) throw new IllegalArgumentException("A positive resource ID is required.");
    }

    private Ticket.TicketStatus parseStatus(String status) {
        if (status == null) return null;
        if (status.length() > 32) throw new IllegalArgumentException("Invalid ticket status.");
        return status.isBlank() ? null : Ticket.TicketStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
    }

    private Ticket.TicketPriority parsePriority(String priority) {
        if (priority == null) return null;
        if (priority.length() > 16) throw new IllegalArgumentException("Invalid ticket priority.");
        return priority.isBlank() ? null : Ticket.TicketPriority.valueOf(priority.trim().toUpperCase(Locale.ROOT));
    }

    private void requireBody(String body) {
        if (body == null || body.isBlank() || body.length() > TicketCreateDto.MAX_BODY_LENGTH) {
            throw new IllegalArgumentException("Message body must contain 1 to " + TicketCreateDto.MAX_BODY_LENGTH + " characters.");
        }
    }

    private String replySubject(Ticket ticket) {
        String subject = "Re: [" + ticket.getTicketNumber() + "] " + ticket.getSubject();
        return subject.substring(0, Math.min(subject.length(), 500));
    }

    private void setAuthor(TicketThread thread, User actor) {
        thread.setSenderType(TicketThread.SenderType.AGENT);
        thread.setSenderUser(actor);
        thread.setFromEmail(actor.getEmail());
        thread.setFromName(actor.getDisplayName() == null || actor.getDisplayName().isBlank()
                ? actor.getEmail() : actor.getDisplayName());
    }
}
