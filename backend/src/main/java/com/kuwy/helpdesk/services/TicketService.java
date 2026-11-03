package com.kuwy.helpdesk.services;

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
        List<TicketThread> threads = threadRepository.findByTicketIdOrderByCreatedAtAsc(id);
        ticket.setThreads(threads);
        return ticket;
    }

    @Transactional(readOnly = true)
    public List<TicketThread> getTicketThreads(Long ticketId) {
        return threadRepository.findByTicketIdOrderByCreatedAtAsc(ticketId);
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

        // Generate Ticket Number (e.g. KUWY-1003)
        Long maxId = ticketRepository.findMaxTicketIdForCompany(company.getId());
        long nextSeq = (maxId != null ? maxId : 0) + 1001;
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
}
