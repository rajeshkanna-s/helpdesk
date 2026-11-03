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
    private final UserRepository userRepository;
    private final SubscriptionService subscriptionService;

    // Pattern to detect [KUWY-1001] or [ACME-1002] ticket reference in subject
    private static final Pattern TICKET_TAG_PATTERN = Pattern.compile("\\[([A-Z0-9]+-[0-9]+)\\]");

    /**
     * Ingest an incoming email received via Microsoft 365, Exchange, or Email Forwarding.
     * Features:
     * - Multi-tenant mailbox isolation
     * - Loop & auto-responder deflection (mailer-daemon, out-of-office)
     * - Sender verification on ticket replies (anti-spoofing)
     * - Subscription status & quota validation
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
        log.info("Processing incoming email from '{}' to recipient '{}': {}", senderEmail, recipientMailboxEmail, subject);

        // 1. Anti-Loop & Auto-Responder Filtering (Prevent mail storms and infinite bounce loops)
        if (isLoopOrAutoReply(senderEmail, subject)) {
            log.warn("Detected automated auto-responder or bounce notice from '{}' with subject '{}'. Suppressing automatic reply/ticket creation to avoid loop.", senderEmail, subject);
            return null;
        }

        // 2. Resolve Company and Mailbox (Match by direct email or forwarding address)
        CompanyMailbox mailbox = mailboxRepository.findByEmailAddress(recipientMailboxEmail)
                .or(() -> mailboxRepository.findByForwardingAddress(recipientMailboxEmail))
                .orElseThrow(() -> new RuntimeException("No configured company mailbox or forwarding address found for: " + recipientMailboxEmail));

        Company company = mailbox.getCompany();

        boolean isForwarded = mailbox.getForwardingAddress() != null &&
                recipientMailboxEmail != null &&
                recipientMailboxEmail.equalsIgnoreCase(mailbox.getForwardingAddress());

        // Automatically verify forwarding when forwarded email or confirmation is processed
        if (isForwarded || (subject != null && (subject.contains("Forwarding Confirmation") || subject.contains("confirmation code") || subject.contains("verification code")))) {
            mailbox.setForwardingVerified(true);
            mailboxRepository.save(mailbox);
        }

        // 3. Thread Matching Engine (Check if this email belongs to an existing ticket)
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

        // 4. Resolve Customer Contact
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

            // 5. Anti-Spoofing: Verify sender authorization on existing ticket
            boolean isOriginalRequester = ticket.getContact() != null &&
                    senderEmail.equalsIgnoreCase(ticket.getContact().getEmail());
            boolean isStaffAgent = userRepository.findByCompanyIdAndEmail(company.getId(), senderEmail).isPresent();

            TicketThread thread = new TicketThread();
            thread.setCompany(company);
            thread.setTicket(ticket);
            thread.setFromEmail(senderEmail);
            thread.setFromName(senderName != null ? senderName : senderEmail);
            thread.setSubject(subject);
            thread.setInternetMessageId(internetMessageId);

            if (isOriginalRequester) {
                // Legitimate Customer Reply
                thread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
                thread.setSenderType(TicketThread.SenderType.CUSTOMER);
                thread.setSenderContact(contact);
                thread.setBodyHtml(bodyHtml != null ? bodyHtml : "<p>" + (bodyText != null ? bodyText : "") + "</p>");
                thread.setBodyText(bodyText);
                thread.setIsPrivate(false);

                // Re-open ticket if it was resolved or closed
                if (ticket.getStatus() == Ticket.TicketStatus.RESOLVED || ticket.getStatus() == Ticket.TicketStatus.CLOSED) {
                    ticket.setStatus(Ticket.TicketStatus.OPEN);
                } else if (ticket.getStatus() == Ticket.TicketStatus.WAITING_ON_CUSTOMER) {
                    ticket.setStatus(Ticket.TicketStatus.IN_PROGRESS);
                }
            } else if (isStaffAgent) {
                // Company Agent replied via email client
                thread.setThreadType(TicketThread.ThreadType.REPLY);
                thread.setSenderType(TicketThread.SenderType.AGENT);
                thread.setBodyHtml(bodyHtml != null ? bodyHtml : "<p>" + (bodyText != null ? bodyText : "") + "</p>");
                thread.setBodyText(bodyText);
                thread.setIsPrivate(false);
            } else {
                // UNVERIFIED THIRD-PARTY: Potential thread injection/spoofing
                // Protect customer data by storing as an internal note with security warning
                log.warn("SECURITY WARNING: Email received for ticket #{} from unverified third-party '{}'. Storing as private internal note.",
                        ticket.getTicketNumber(), senderEmail);
                thread.setThreadType(TicketThread.ThreadType.PRIVATE_NOTE);
                thread.setSenderType(TicketThread.SenderType.SYSTEM);
                thread.setBodyHtml("<div class='alert alert-warning p-2'><strong>[SECURITY NOTICE]</strong> Email received from unverified third-party address: <code>" +
                        senderEmail + "</code>. Marked private to protect customer thread integrity.</div>" + (bodyHtml != null ? bodyHtml : ""));
                thread.setBodyText("[SECURITY NOTICE: Email from unverified third-party: " + senderEmail + "]\n\n" + (bodyText != null ? bodyText : ""));
                thread.setIsPrivate(true);
            }

            threadRepository.save(thread);
            return ticketRepository.save(ticket);

        } else {
            // New Ticket Creation from Email -> Verify Subscription & Quota Limits
            subscriptionService.assertCanCreateTicket(company.getId());

            log.info("Creating new ticket for incoming email from {}", senderEmail);

            Long maxSeq = ticketRepository.findMaxTicketSequenceForCompany(company.getId());
            long nextSeq = (maxSeq != null && maxSeq >= 1000 ? maxSeq : 1000) + 1;
            String ticketNumber = company.getCompanyCode() + "-" + nextSeq;

            Ticket newTicket = new Ticket();
            newTicket.setCompany(company);
            newTicket.setTicketNumber(ticketNumber);
            newTicket.setDepartment(mailbox.getDepartment());
            newTicket.setContact(contact);
            newTicket.setSourceMailbox(mailbox);
            newTicket.setChannel(isForwarded ? Ticket.TicketChannel.EMAIL : Ticket.TicketChannel.MICROSOFT_365);
            newTicket.setSubject(subject != null ? subject : "Support Request from " + senderEmail);
            newTicket.setDescriptionHtml(bodyHtml != null ? bodyHtml : "<p>" + (bodyText != null ? bodyText : "") + "</p>");
            newTicket.setDescriptionText(bodyText);
            newTicket.setInternetMessageId(internetMessageId);
            newTicket.setMsConversationId(msConversationId);
            newTicket.setStatus(Ticket.TicketStatus.OPEN);
            newTicket.setPriority(Ticket.TicketPriority.MEDIUM);
            newTicket.setFirstResponseDueAt(LocalDateTime.now().plusHours(8));
            newTicket.setSlaStatus(Ticket.SlaStatus.WITHIN_SLA);

            Ticket savedTicket = ticketRepository.save(newTicket);

            // Record initial thread
            TicketThread initialThread = new TicketThread();
            initialThread.setCompany(company);
            initialThread.setTicket(savedTicket);
            initialThread.setThreadType(TicketThread.ThreadType.CUSTOMER_REPLY);
            initialThread.setSenderType(TicketThread.SenderType.CUSTOMER);
            initialThread.setSenderContact(contact);
            initialThread.setFromEmail(senderEmail);
            initialThread.setFromName(senderName != null ? senderName : senderEmail);
            initialThread.setSubject(savedTicket.getSubject());
            initialThread.setBodyHtml(savedTicket.getDescriptionHtml());
            initialThread.setBodyText(savedTicket.getDescriptionText());
            initialThread.setInternetMessageId(internetMessageId);
            initialThread.setIsPrivate(false);
            threadRepository.save(initialThread);

            return savedTicket;
        }
    }

    private boolean isLoopOrAutoReply(String senderEmail, String subject) {
        if (senderEmail == null || senderEmail.isBlank()) return true;
        String email = senderEmail.toLowerCase().trim();

        if (email.startsWith("mailer-daemon") ||
            email.startsWith("postmaster") ||
            email.contains("no-reply") ||
            email.contains("noreply") ||
            email.startsWith("autoresponder")) {
            return true;
        }

        if (subject != null) {
            String s = subject.toLowerCase().trim();
            if (s.startsWith("automatic reply:") ||
                s.startsWith("out of office:") ||
                s.startsWith("auto-reply:") ||
                s.contains("undelivered mail returned") ||
                s.contains("delivery status notification")) {
                return true;
            }
        }
        return false;
    }
}
