package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketAttachment;
import com.kuwy.helpdesk.services.AttachmentService;
import com.kuwy.helpdesk.services.SubscriptionService;
import com.kuwy.helpdesk.services.TicketService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class AttachmentController {

    private final AttachmentService attachmentService;
    private final TicketService ticketService;
    private final SubscriptionService subscriptionService;

    @PostMapping(value = "/tickets/{ticketId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<TicketAttachment>> uploadAttachments(
            @PathVariable Long ticketId,
            @RequestParam("files") MultipartFile[] files,
            @RequestParam(value = "threadId", required = false) Long threadId,
            @RequestParam(value = "isInline", defaultValue = "false") boolean isInline
    ) throws IOException {
        Ticket ticket = ticketService.getTicketById(ticketId);

        // Anti-leak: Verify that caller has access to this ticket's company
        TenantContext.assertAccessTo(ticket.getCompany().getId());

        if (subscriptionService.isWorkspaceLocked(ticket.getCompany().getId())) {
            throw new IllegalStateException("Workspace is locked. File uploads are disabled.");
        }

        List<TicketAttachment> uploaded = new ArrayList<>();

        for (MultipartFile file : files) {
            if (!file.isEmpty()) {
                TicketAttachment saved = attachmentService.saveAttachment(
                        file,
                        ticket.getCompany().getId(),
                        ticketId,
                        threadId,
                        isInline
                );
                uploaded.add(saved);
            }
        }

        return ResponseEntity.ok(uploaded);
    }

    @GetMapping("/tickets/{ticketId}/attachments")
    public ResponseEntity<List<TicketAttachment>> getTicketAttachments(@PathVariable Long ticketId) {
        Ticket ticket = ticketService.getTicketById(ticketId);
        String role = TenantContext.getUserRole();
        if ("ROLE_CUSTOMER".equalsIgnoreCase(role) || "CUSTOMER".equalsIgnoreCase(role)) {
            String customerEmail = TenantContext.getUserEmail();
            if (customerEmail == null || ticket.getContact() == null || !customerEmail.equalsIgnoreCase(ticket.getContact().getEmail())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to ticket attachments.");
            }
        }
        TenantContext.assertAccessTo(ticket.getCompany().getId());
        return ResponseEntity.ok(attachmentService.getAttachmentsForTicket(ticketId));
    }

    @GetMapping("/attachments/{id}/download")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) throws IOException {
        TicketAttachment attachment = attachmentService.getAttachmentById(id);
        authorizeAttachmentAccess(attachment);

        Resource resource = attachmentService.getResourceForAttachment(attachment);

        String encodedFileName = URLEncoder.encode(attachment.getFileName(), StandardCharsets.UTF_8).replace("+", "%20");
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            if (attachment.getContentType() != null) {
                mediaType = MediaType.parseMediaType(attachment.getContentType());
            }
        } catch (Exception ignored) {}

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + attachment.getFileName() + "\"; filename*=UTF-8''" + encodedFileName)
                .body(resource);
    }

    @GetMapping("/attachments/{id}/preview")
    public ResponseEntity<Resource> previewAttachment(@PathVariable Long id) throws IOException {
        TicketAttachment attachment = attachmentService.getAttachmentById(id);
        authorizeAttachmentAccess(attachment);

        Resource resource = attachmentService.getResourceForAttachment(attachment);

        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        try {
            if (attachment.getContentType() != null) {
                mediaType = MediaType.parseMediaType(attachment.getContentType());
            }
        } catch (Exception ignored) {}

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + attachment.getFileName() + "\"")
                .body(resource);
    }

    @DeleteMapping("/attachments/{id}")
    public ResponseEntity<Void> deleteAttachment(@PathVariable Long id) {
        TicketAttachment attachment = attachmentService.getAttachmentById(id);
        authorizeAttachmentAccess(attachment);
        attachmentService.deleteAttachment(id);
        return ResponseEntity.noContent().build();
    }

    private void authorizeAttachmentAccess(TicketAttachment attachment) {
        if (attachment == null || attachment.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Attachment not found.");
        }
        Long companyId = attachment.getCompany().getId();

        // 1. If portal customer: verify that requester email matches authenticated customer email
        String role = TenantContext.getUserRole();
        if ("ROLE_CUSTOMER".equalsIgnoreCase(role) || "CUSTOMER".equalsIgnoreCase(role)) {
            String customerEmail = TenantContext.getUserEmail();
            if (customerEmail == null || attachment.getTicket() == null || attachment.getTicket().getContact() == null
                    || !customerEmail.equalsIgnoreCase(attachment.getTicket().getContact().getEmail())) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Access denied to attachment.");
            }
            TenantContext.assertAccessTo(companyId);
            return;
        }

        // 2. If staff or super admin: require valid authenticated user session and verify company access
        if (TenantContext.getUserId() == null && TenantContext.getUserEmail() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required to access attachments.");
        }
        TenantContext.assertAccessTo(companyId);
    }
}
