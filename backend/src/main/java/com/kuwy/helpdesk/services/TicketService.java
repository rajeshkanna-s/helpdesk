package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.dto.BulkUpdateDto;
import com.kuwy.helpdesk.dto.ScenarioExecuteDto;
import com.kuwy.helpdesk.dto.TicketCreateDto;
import com.kuwy.helpdesk.dto.TicketReplyDto;
import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class TicketService {

    private final TicketRepository ticketRepository;
    private final TicketThreadRepository threadRepository;
    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final ContactRepository contactRepository;
    private final UserRepository userRepository;
    private final TicketAttachmentRepository attachmentRepository;

    @Transactional(readOnly = true)
    public Page<Ticket> getCompanyTickets(Long companyId, String status, Long agentId, Pageable pageable) {
        if (status != null && !status.isBlank()) {
            return ticketRepository.findByCompanyIdAndStatus(companyId, Ticket.TicketStatus.valueOf(status.toUpperCase()), pageable);
        }
        if (agentId != null) {
            return ticketRepository.findByCompanyIdAndAssignedAgentId(companyId, agentId, pageable);
        }
        return ticketRepository.findByCompanyId(companyId, pageable);
    }

    @Transactional(readOnly = true)
    public Ticket getTicketById(Long id) {
        Ticket ticket = ticketRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + id));
        List<TicketThread> threads = getTicketThreads(id);
        ticket.setThreads(threads);
        return ticket;
    }

    @Transactional(readOnly = true)
    public List<TicketThread> getTicketThreads(Long ticketId) {
        List<TicketThread> threads = threadRepository.findByTicketIdOrderByCreatedAtAsc(ticketId);
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
        Company company = companyRepository.findById(dto.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Company not found: " + dto.getCompanyId()));

        Department department = departmentRepository.findById(dto.getDepartmentId())
                .orElseThrow(() -> new RuntimeException("Department not found: " + dto.getDepartmentId()));

        // Resolve or create customer contact
        Contact contact = contactRepository.findByCompanyIdAndEmail(company.getId(), dto.getRequesterEmail())
                .orElseGet(() -> {
                    Contact newContact = new Contact();
                    newContact.setCompany(company);
                    newContact.setEmail(dto.getRequesterEmail());
                    newContact.setFirstName(dto.getRequesterName() != null ? dto.getRequesterName() : dto.getRequesterEmail());
                    return contactRepository.save(newContact);
                });

        // Generate Ticket Number (e.g. KUWY-1009)
        Long maxSeq = ticketRepository.findMaxTicketSequenceForCompany(company.getId());
        long nextSeq = (maxSeq != null && maxSeq >= 1000 ? maxSeq : 1000) + 1;
        String ticketNumber = company.getCompanyCode() + "-" + nextSeq;

        Ticket ticket = new Ticket();
        ticket.setCompany(company);
        ticket.setTicketNumber(ticketNumber);
        ticket.setDepartment(department);
        ticket.setContact(contact);
        ticket.setSubject(dto.getSubject());
        ticket.setDescriptionText(dto.getDescription());
        ticket.setDescriptionHtml("<p>" + dto.getDescription() + "</p>");
        ticket.setPriority(dto.getPriority() != null ? dto.getPriority() : Ticket.TicketPriority.MEDIUM);
        ticket.setStatus(Ticket.TicketStatus.OPEN);
        ticket.setChannel(dto.getChannel() != null ? dto.getChannel() : Ticket.TicketChannel.WEB_PORTAL);
        ticket.setFirstResponseDueAt(LocalDateTime.now().plusHours(4)); // Default 4-hour SLA

        if (dto.getAssignedAgentId() != null) {
            userRepository.findById(dto.getAssignedAgentId()).ifPresent(ticket::setAssignedAgent);
        } else {
            // Auto-assign round robin among active company agents
            List<User> activeAgents = userRepository.findByCompanyIdAndIsActiveTrue(company.getId());
            if (!activeAgents.isEmpty()) {
                ticket.setAssignedAgent(activeAgents.get((int) (nextSeq % activeAgents.size())));
            }
        }

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
        initialThread.setSubject(dto.getSubject());
        initialThread.setBodyText(dto.getDescription());
        initialThread.setBodyHtml("<p>" + dto.getDescription() + "</p>");
        initialThread.setIsPrivate(false);
        threadRepository.save(initialThread);

        return savedTicket;
    }

    @Transactional
    public TicketThread addReply(Long ticketId, TicketReplyDto dto) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));

        TicketThread thread = new TicketThread();
        thread.setCompany(ticket.getCompany());
        thread.setTicket(ticket);
        thread.setSubject("Re: [" + ticket.getTicketNumber() + "] " + ticket.getSubject());
        thread.setBodyText(dto.getBody());
        thread.setBodyHtml("<p>" + dto.getBody() + "</p>");
        thread.setIsPrivate(Boolean.TRUE.equals(dto.getIsPrivate()));

        if (Boolean.TRUE.equals(dto.getIsPrivate())) {
            thread.setThreadType(TicketThread.ThreadType.PRIVATE_NOTE);
            thread.setSenderType(TicketThread.SenderType.AGENT);
            thread.setFromEmail(dto.getSenderEmail() != null ? dto.getSenderEmail() : "testinternal@kuwy.in");
            thread.setFromName(dto.getSenderName() != null ? dto.getSenderName() : "Support Agent");
            if (dto.getSenderUserId() != null) {
                userRepository.findById(dto.getSenderUserId()).ifPresent(thread::setSenderUser);
            }
        } else {
            thread.setThreadType(TicketThread.ThreadType.REPLY);
            thread.setSenderType(TicketThread.SenderType.AGENT);
            thread.setFromEmail(dto.getSenderEmail() != null ? dto.getSenderEmail() : "testsupport@kuwy.in");
            thread.setFromName(dto.getSenderName() != null ? dto.getSenderName() : "Kuwy Support Team");
            thread.setToEmails(ticket.getContact().getEmail());

            if (dto.getSenderUserId() != null) {
                userRepository.findById(dto.getSenderUserId()).ifPresent(thread::setSenderUser);
            }

            // Update ticket first response timestamp if not already set
            if (ticket.getFirstResponseAt() == null) {
                ticket.setFirstResponseAt(LocalDateTime.now());
            }

            // Set ticket to Waiting on Customer or In Progress
            if (ticket.getStatus() == Ticket.TicketStatus.OPEN) {
                ticket.setStatus(Ticket.TicketStatus.WAITING_ON_CUSTOMER);
                ticketRepository.save(ticket);
            }
        }

        return threadRepository.save(thread);
    }

    @Transactional
    public Ticket updateStatus(Long ticketId, Ticket.TicketStatus newStatus) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));
        ticket.setStatus(newStatus);
        if (newStatus == Ticket.TicketStatus.RESOLVED) {
            ticket.setResolvedAt(LocalDateTime.now());
        }
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket updatePriority(Long ticketId, Ticket.TicketPriority newPriority) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));
        ticket.setPriority(newPriority);
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket updateDepartment(Long ticketId, Long departmentId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));
        Department department = departmentRepository.findById(departmentId)
                .orElseThrow(() -> new RuntimeException("Department not found: " + departmentId));
        ticket.setDepartment(department);
        return ticketRepository.save(ticket);
    }

    @Transactional
    public Ticket assignAgent(Long ticketId, Long agentId) {
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));
        User agent = userRepository.findById(agentId)
                .orElseThrow(() -> new RuntimeException("Agent not found: " + agentId));
        ticket.setAssignedAgent(agent);
        if (ticket.getStatus() == Ticket.TicketStatus.OPEN) {
            ticket.setStatus(Ticket.TicketStatus.IN_PROGRESS);
        }
        return ticketRepository.save(ticket);
    }

    @Transactional
    public void bulkUpdate(BulkUpdateDto dto) {
        if (dto.getTicketIds() == null || dto.getTicketIds().isEmpty()) return;
        List<Ticket> tickets = ticketRepository.findAllById(dto.getTicketIds());
        User agent = (dto.getAgentId() != null) ? userRepository.findById(dto.getAgentId()).orElse(null) : null;
        Department dept = (dto.getDepartmentId() != null) ? departmentRepository.findById(dto.getDepartmentId()).orElse(null) : null;

        for (Ticket t : tickets) {
            if (dto.getStatus() != null && !dto.getStatus().isBlank()) {
                t.setStatus(Ticket.TicketStatus.valueOf(dto.getStatus().toUpperCase()));
                if (t.getStatus() == Ticket.TicketStatus.RESOLVED) {
                    t.setResolvedAt(LocalDateTime.now());
                }
            }
            if (dto.getPriority() != null && !dto.getPriority().isBlank()) {
                t.setPriority(Ticket.TicketPriority.valueOf(dto.getPriority().toUpperCase()));
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
        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));

        String noteText = "";
        String replyText = "";
        boolean isReply = false;

        switch (dto.getScenarioKey()) {
            case "KYC_RESUBMIT":
                ticket.setStatus(Ticket.TicketStatus.WAITING_ON_CUSTOMER);
                ticket.setPriority(Ticket.TicketPriority.HIGH);
                replyText = "Hello " + ticket.getContact().getFirstName() + ",\n\nWe have reviewed your application and noticed a verification discrepancy with your submitted KYC documents. Please re-upload clear copies of your PAN and Aadhaar cards through our partner portal.\n\nThank you,\nKuwy Support Team";
                isReply = true;
                break;
            case "ESCALATE_LEAD":
                ticket.setPriority(Ticket.TicketPriority.URGENT);
                ticket.setStatus(Ticket.TicketStatus.IN_PROGRESS);
                noteText = "⚡ Scenario Macro Executed: Escalated to Senior Support Lead for critical review. Turnaround required within 2 hours.";
                break;
            case "LOAN_APPROVED":
                ticket.setStatus(Ticket.TicketStatus.RESOLVED);
                ticket.setResolvedAt(LocalDateTime.now());
                replyText = "Dear " + ticket.getContact().getFirstName() + ",\n\nCongratulations! Your loan verification has been successfully approved by the underwriting team. Disbursement details have been dispatched to your registered mobile and email.\n\nRegards,\nKuwy Finance Operations";
                isReply = true;
                break;
            case "CUSTOMER_INACTIVE":
                ticket.setStatus(Ticket.TicketStatus.CLOSED);
                ticket.setResolvedAt(LocalDateTime.now());
                noteText = "⚡ Scenario Macro Executed: Closed ticket due to customer non-response after follow-up period.";
                break;
            default:
                if (dto.getCustomNote() != null) {
                    noteText = dto.getCustomNote();
                }
                break;
        }

        Ticket saved = ticketRepository.save(ticket);

        if (isReply && !replyText.isBlank()) {
            TicketThread thread = new TicketThread();
            thread.setCompany(ticket.getCompany());
            thread.setTicket(saved);
            thread.setThreadType(TicketThread.ThreadType.REPLY);
            thread.setSenderType(TicketThread.SenderType.AGENT);
            thread.setFromEmail("testsupport@kuwy.in");
            thread.setFromName(dto.getAuthorName() != null ? dto.getAuthorName() : "Kuwy Automation Lead");
            thread.setToEmails(ticket.getContact().getEmail());
            thread.setSubject("Re: [" + ticket.getTicketNumber() + "] " + ticket.getSubject());
            thread.setBodyText(replyText);
            thread.setBodyHtml("<p>" + replyText.replace("\n", "<br/>") + "</p>");
            thread.setIsPrivate(false);
            threadRepository.save(thread);
        } else if (!noteText.isBlank()) {
            TicketThread note = new TicketThread();
            note.setCompany(ticket.getCompany());
            note.setTicket(saved);
            note.setThreadType(TicketThread.ThreadType.PRIVATE_NOTE);
            note.setSenderType(TicketThread.SenderType.AGENT);
            note.setFromEmail("testinternal@kuwy.in");
            note.setFromName(dto.getAuthorName() != null ? dto.getAuthorName() : "Support System");
            note.setSubject("Internal Note: Scenario Executed");
            note.setBodyText(noteText);
            note.setBodyHtml("<p>" + noteText + "</p>");
            note.setIsPrivate(true);
            threadRepository.save(note);
        }

        return saved;
    }
}
