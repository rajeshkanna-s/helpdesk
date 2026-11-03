package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.dto.MailboxConnectDto;
import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.CompanyMailbox;
import com.kuwy.helpdesk.models.Department;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.repositories.CompanyMailboxRepository;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.DepartmentRepository;
import com.kuwy.helpdesk.services.EmailIngestionService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class MailboxController {

    private final CompanyMailboxRepository mailboxRepository;
    private final CompanyRepository companyRepository;
    private final DepartmentRepository departmentRepository;
    private final EmailIngestionService emailIngestionService;

    @GetMapping
    public ResponseEntity<List<CompanyMailbox>> listMailboxes(@RequestParam(required = false) Long companyId) {
        Long targetId = companyId != null ? companyId : TenantContext.getCompanyId();
        if (targetId == null) {
            targetId = 1L;
        }
        List<CompanyMailbox> list = mailboxRepository.findByCompanyId(targetId);
        // Ensure every mailbox has a deterministic forwarding address
        for (CompanyMailbox mb : list) {
            if (mb.getForwardingAddress() == null || mb.getForwardingAddress().isBlank()) {
                mb.setForwardingAddress(mb.getId() + "81753993@tickets.helpdesk.com");
                mb.setForwardingVerified(true);
                mailboxRepository.save(mb);
            }
        }
        return ResponseEntity.ok(list);
    }

    @PostMapping("/{id}/verify-forwarding")
    public ResponseEntity<CompanyMailbox> verifyForwarding(@PathVariable Long id) {
        CompanyMailbox mailbox = mailboxRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Mailbox not found: " + id));
        mailbox.setForwardingVerified(true);
        if (mailbox.getForwardingAddress() == null || mailbox.getForwardingAddress().isBlank()) {
            mailbox.setForwardingAddress(id + "81753993@tickets.helpdesk.com");
        }
        return ResponseEntity.ok(mailboxRepository.save(mailbox));
    }

    @PostMapping("/connect-ms365")
    public ResponseEntity<CompanyMailbox> connectMs365Mailbox(@RequestBody MailboxConnectDto dto) {
        Company company = companyRepository.findById(dto.getCompanyId())
                .orElseThrow(() -> new RuntimeException("Company not found: " + dto.getCompanyId()));

        Department department = departmentRepository.findById(dto.getDepartmentId())
                .orElseThrow(() -> new RuntimeException("Department not found: " + dto.getDepartmentId()));

        CompanyMailbox mailbox = new CompanyMailbox();
        mailbox.setCompany(company);
        mailbox.setDepartment(department);
        mailbox.setMailboxName(dto.getMailboxName());
        mailbox.setEmailAddress(dto.getEmailAddress());
        mailbox.setForwardingAddress(System.currentTimeMillis() + "@tickets.helpdesk.com");
        mailbox.setForwardingVerified(false);
        mailbox.setProviderType(CompanyMailbox.MailProviderType.MICROSOFT_365);
        mailbox.setAuthType(CompanyMailbox.AuthType.OAUTH2_GRAPH_API);
        mailbox.setMsTenantId(dto.getMsTenantId());
        mailbox.setMsClientId(dto.getMsClientId());
        mailbox.setMsClientSecretEnc(dto.getMsClientSecret());
        mailbox.setSyncStatus(CompanyMailbox.SyncStatus.CONNECTED);
        mailbox.setIsActive(true);

        return ResponseEntity.ok(mailboxRepository.save(mailbox));
    }

    /**
     * Endpoint to ingest incoming email (can be invoked by Microsoft Graph Webhook Notification,
     * Email Forwarding, Azure Logic Apps, or tested directly from UI)
     */
    @PostMapping("/simulate-incoming-mail")
    public ResponseEntity<Ticket> simulateIncomingEmail(@RequestBody IngestMailRequest request) {
        Ticket ticket = emailIngestionService.processIncomingEmail(
                request.getRecipientMailbox(),
                request.getSenderEmail(),
                request.getSenderName(),
                request.getSubject(),
                request.getBodyHtml(),
                request.getBodyText(),
                request.getInternetMessageId(),
                request.getMsConversationId(),
                request.getInReplyTo()
        );
        return ResponseEntity.ok(ticket);
    }

    @Getter
    @Setter
    public static class IngestMailRequest {
        private String recipientMailbox;
        private String senderEmail;
        private String senderName;
        private String subject;
        private String bodyHtml;
        private String bodyText;
        private String internetMessageId;
        private String msConversationId;
        private String inReplyTo;
    }
}
