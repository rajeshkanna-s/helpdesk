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
import com.kuwy.helpdesk.services.CompanyService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

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
    private final CompanyService companyService;

    @GetMapping
    public ResponseEntity<List<CompanyMailbox>> listMailboxes(@RequestParam(required = false) Long companyId) {
        Long targetId = companyId != null ? companyId : TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(targetId);
        return ResponseEntity.ok(companyService.getCompanyMailboxes(targetId));
    }

    @PostMapping("/{id}/verify-forwarding")
    public ResponseEntity<CompanyMailbox> verifyForwarding(@PathVariable Long id) {
        TenantContext.requireUserId();
        CompanyMailbox mailbox = mailboxRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Mailbox not found: " + id));
        TenantContext.assertCompanyAdminAccessTo(mailbox.getCompany() != null ? mailbox.getCompany().getId() : null);
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED,
                "Forwarding verification requires a verified delivery challenge; configuration alone is not proof.");
    }

    @PostMapping("/connect-ms365")
    @Transactional
    public ResponseEntity<CompanyMailbox> connectMs365Mailbox(@RequestBody MailboxConnectDto dto) {
        Long companyId = dto.getCompanyId() != null ? dto.getCompanyId() : TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(companyId);
        Company company = companyRepository.findById(companyId)
                .orElseThrow(() -> new RuntimeException("Company not found: " + companyId));

        Department department = departmentRepository.findById(dto.getDepartmentId())
                .filter(d -> d.getCompany() != null && companyId.equals(d.getCompany().getId()))
                .orElseThrow(() -> new SecurityException("Department not found in this workspace."));

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
        mailbox.setSyncStatus(CompanyMailbox.SyncStatus.PAUSED);
        mailbox.setSyncErrorDetails("Configuration saved; OAuth connection has not been verified.");
        mailbox.setIsActive(true);

        CompanyMailbox saved = mailboxRepository.save(mailbox);
        companyService.recordAuditLog(companyId, "MAILBOX_CONFIGURED",
                "Saved Microsoft 365 mailbox configuration for " + saved.getEmailAddress(), null, null);
        return ResponseEntity.ok(saved);
    }

    /**
     * Administrator-only ingestion/testing. Provider callbacks require a separate verified delivery flow.
     */
    @PostMapping({"/ingest", "/simulate-incoming-mail", "/simulate"})
    @Transactional
    public ResponseEntity<Ticket> ingestEmail(@RequestBody IngestEmailRequest req) {
        Long companyId = TenantContext.getCompanyId();
        TenantContext.assertCompanyAdminAccessTo(companyId);
        if (req.getRecipientMailbox() == null || req.getRecipientMailbox().isBlank()) {
            throw new IllegalArgumentException("A recipient mailbox is required.");
        }
        CompanyMailbox mailbox = mailboxRepository.findByEmailAddress(req.getRecipientMailbox())
                .or(() -> mailboxRepository.findByForwardingAddress(req.getRecipientMailbox()))
                .orElseThrow(() -> new SecurityException("Mailbox not found in this workspace."));
        if (mailbox.getCompany() == null || !companyId.equals(mailbox.getCompany().getId())
                || mailbox.getDepartment() == null || mailbox.getDepartment().getCompany() == null
                || !companyId.equals(mailbox.getDepartment().getCompany().getId())) {
            throw new SecurityException("Recipient mailbox does not belong to the current workspace.");
        }
        if (!Boolean.TRUE.equals(mailbox.getIsActive())) {
            throw new IllegalStateException("The recipient mailbox is inactive.");
        }
        Ticket ticket = emailIngestionService.processIncomingEmail(
                req.getRecipientMailbox(),
                req.getSenderEmail(),
                req.getSenderName(),
                req.getSubject(),
                req.getBodyHtml(),
                req.getBodyText(),
                req.getInternetMessageId(),
                req.getMsConversationId(),
                req.getInReplyTo()
        );
        if (ticket == null) {
            return ResponseEntity.noContent().build();
        }
        if (ticket.getCompany() == null || !companyId.equals(ticket.getCompany().getId())) {
            throw new SecurityException("Ingested ticket does not belong to the current workspace.");
        }
        companyService.recordAuditLog(companyId, "MAILBOX_INGESTED",
                "Administrator ingested a message for mailbox ID #" + mailbox.getId(), null, null);
        return ResponseEntity.ok(ticket);
    }

    @Getter
    @Setter
    public static class IngestEmailRequest {
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
