package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.*;
import com.kuwy.helpdesk.repositories.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailIngestionService {

    private final TicketRepository ticketRepository;
    private final TicketThreadRepository threadRepository;
    private final CompanyMailboxRepository mailboxRepository;
    private final ContactRepository contactRepository;

    // Pattern to detect [KUWY-1001] or [ACME-1002] ticket reference in subject
    private static final Pattern TICKET_TAG_PATTERN = Pattern.compile("\\[([A-Z0-9]+-[0-9]+)\\]");

    /**
     * Ingest an incoming email received via Microsoft 365 (Graph API Webhook or Exchange)
     */
    @Transactional
    public Ticket processIncomingEmail(
            String recipientMailboxEmail,
            String senderEmail,
            String senderName,
            String subject,
            String bodyHtml,
            String bodyText,
            String internetMessageId,
            String msConversationId,
            String inReplyTo
    ) {
        log.info("Processing incoming MS365 email from '{}' to mailbox '{}': {}", senderEmail, recipientMailboxEmail, subject);

        // 1. Resolve Company and Mailbox
        CompanyMailbox mailbox = mailboxRepository.findByEmailAddress(recipientMailboxEmail)
                .orElseThrow(() -> new RuntimeException("No configured company mailbox found for: " + recipientMailboxEmail));

        Company company = mailbox.getCompany();

        // 2. Thread Matching Engine (Check if this email belongs to an existing ticket)
        Optional<Ticket> existingTicketOpt = Optional.empty();

        // Check A: Match by inReplyTo / internetMessageId
        if (inReplyTo != null && !inReplyTo.isBlank()) {
            existingTicketOpt = ticketRepository.findByCompanyIdAndInternetMessageId(company.getId(), inReplyTo.trim());
        }

        // Check B: Match by Microsoft Graph msConversationId
        if (existingTicketOpt.isEmpty() && msConversationId != null && !msConversationId.isBlank()) {
            existingTicketOpt = ticketRepository.findByCompanyIdAndMsConversationId(company.getId(), msConversationId.trim());
        }

        // Check C: Match by Ticket Code in Subject (e.g. "[KUWY-1001]")
        if (existingTicketOpt.isEmpty() && subject != null) {
            Matcher matcher = TICKET_TAG_PATTERN.matcher(subject);
            if (matcher.find()) {
                String ticketNumber = matcher.group(1);
                existingTicketOpt = ticketRepository.findByCompanyIdAndTicketNumber(company.getId(), ticketNumber);
            }
        }

        // 3. Resolve Customer Contact
        Contact contact = contactRepository.findByCompanyIdAndEmail(company.getId(), senderEmail)
                .orElseGet(() -> {
                    Contact newContact = new Contact();
                    newContact.setCompany(company);
                    newContact.setEmail(senderEmail);
                    newContact.setFirstName(senderName != null && !senderName.isBlank() ? senderName : senderEmail);
                    return contactRepository.save(newContact);
                });

        if (existingTicketOpt.isPresent()) {
            // Existing Ticket -> Add New Customer Reply Thread
            Ticket ticket = existingTicketOpt.get();
            log.info("Matched incoming email to existing ticket #{}", ticket.getTicketNumber());

            TicketThread thread = new TicketThread();
            thread.setCompany(company);
            thread.setTicket(ticket);
            thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
            thread.setSenderType(TicketThread.SenderType.CUSTOMER);
            thread.setSenderContact(contact);
            thread.setFromEmail(senderEmail);
            thread.setFromName(senderName != null ? senderName : senderEmail);
            thread.setSubject(subject);
            thread.setBodyHtml(bodyHtml != null ? bodyHtml : "<p>" + bodyText + "</p>");
            thread.setBodyText(bodyText);
            thread.setInternetMessageId(internetMessageId);
            thread.setIsPrivate(false);
            threadRepository.save(thread);

            // Re-open ticket if it was resolved or closed
            if (ticket.getStatus() == Ticket.TicketStatus.RESOLVED || ticket.getStatus() == Ticket.TicketStatus.CLOSED) {
                ticket.setStatus(Ticket.TicketStatus.OPEN);
            } else if (ticket.getStatus() == Ticket.TicketStatus.WAITING_ON_CUSTOMER) {
                ticket.setStatus(Ticket.TicketStatus.IN_PROGRESS);
            }
            return ticketRepository.save(ticket);

        } else {
            // New Ticket Creation from Email
            log.info("Creating new ticket for incoming email from {}", senderEmail);

            Long maxId = ticketRepository.findMaxTicketIdForCompany(company.getId());
            long nextSeq = (maxId != null ? maxId : 0) + 1001;
            String ticketNumber = company.getCompanyCode() + "-" + nextSeq;

            Ticket newTicket = new Ticket();
            newTicket.setCompany(company);
            newTicket.setTicketNumber(ticketNumber);
            newTicket.setDepartment(mailbox.getDepartment());
            newTicket.setContact(contact);
            newTicket.setSourceMailbox(mailbox);
            newTicket.setChannel(Ticket.TicketChannel.MICROSOFT_365);
            newTicket.setSubject(subject != null ? subject : "Support Request from " + senderEmail);
            newTicket.setDescriptionHtml(bodyHtml != null ? bodyHtml : "<p>" + bodyText + "</p>");
            newTicket.setDescriptionText(bodyText);
            newTicket.setInternetMessageId(internetMessageId);
            newTicket.setMsConversationId(msConversationId);
            newTicket.setInReplyTo(inReplyTo);
            newTicket.setStatus(Ticket.TicketStatus.OPEN);
            newTicket.setPriority(Ticket.TicketPriority.MEDIUM);
            newTicket.setFirstResponseDueAt(LocalDateTime.now().plusHours(4));

            Ticket savedTicket = ticketRepository.save(newTicket);

            // Add original email as initial thread
            TicketThread thread = new TicketThread();
            thread.setCompany(company);
            thread.setTicket(savedTicket);
            thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
            thread.setSenderType(TicketThread.SenderType.CUSTOMER);
            thread.setSenderContact(contact);
            thread.setFromEmail(senderEmail);
            thread.setFromName(senderName != null ? senderName : senderEmail);
            thread.setSubject(subject);
            thread.setBodyHtml(newTicket.getDescriptionHtml());
            thread.setBodyText(bodyText);
            thread.setInternetMessageId(internetMessageId);
            thread.setIsPrivate(false);
            threadRepository.save(thread);

            return savedTicket;
        }
    }
}
