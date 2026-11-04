package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketAttachment;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.services.AttachmentService;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/portal/{subdomain}")
@RequiredArgsConstructor
public class PortalAttachmentController {
    private final CompanyRepository companies;
    private final TicketRepository tickets;
    private final AttachmentService attachments;
    private final SubscriptionService subscriptions;

    @PostMapping(value = "/tickets/{ticketNumber}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> upload(@PathVariable String subdomain, @PathVariable String ticketNumber,
                                    @RequestParam("files") MultipartFile[] files,
                                    @RequestParam(required = false) Long threadId) throws IOException {
        Ticket ticket = ownedTicket(subdomain, ticketNumber);
        if (subscriptions.isWorkspaceLocked(ticket.getCompany().getId())) throw new IllegalStateException("Workspace is read-only.");
        List<TicketAttachment> result = attachments.saveAttachments(files, ticket.getCompany().getId(), ticket.getId(), threadId);
        return ResponseEntity.ok().header("Cache-Control", "private, no-store").body(result.stream().map(this::metadata).toList());
    }

    @GetMapping("/attachments/{id}/download")
    public ResponseEntity<Resource> download(@PathVariable String subdomain, @PathVariable Long id) throws IOException {
        var company = companies.findBySubdomain(subdomain.toLowerCase(java.util.Locale.ROOT)).orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        TenantContext.requireCustomerId(company.getId());
        TicketAttachment attachment = attachments.getAttachmentById(id);
        if (!company.getId().equals(attachment.getCompany().getId())) throw new SecurityException("Attachment is not in this workspace.");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(attachment.getFileName(), StandardCharsets.UTF_8).build().toString())
                .header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff")
                .body(attachments.getResourceForAttachment(attachment));
    }

    private Ticket ownedTicket(String subdomain, String number) {
        var company = companies.findBySubdomain(subdomain.toLowerCase(java.util.Locale.ROOT)).orElseThrow(() -> new IllegalArgumentException("Workspace not found."));
        Long contactId = TenantContext.requireCustomerId(company.getId());
        Ticket ticket = tickets.findByCompanyIdAndTicketNumber(company.getId(), number).orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        if (ticket.getContact() == null || !contactId.equals(ticket.getContact().getId())) throw new SecurityException("Ticket not found.");
        return ticket;
    }

    private Map<String, Object> metadata(TicketAttachment attachment) {
        return Map.of("id", attachment.getId(), "fileName", attachment.getFileName(), "fileSizeBytes", attachment.getFileSizeBytes(),
                "contentType", attachment.getContentType(), "scanStatus", attachment.getScanStatus());
    }
}
