package com.kuwy.helpdesk.controllers;

import com.kuwy.helpdesk.models.TicketAttachment;
import com.kuwy.helpdesk.services.AttachmentService;
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

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

    @PostMapping(value = "/tickets/{ticketId}/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<List<TicketAttachment>> uploadAttachments(
            @PathVariable Long ticketId,
            @RequestParam("files") MultipartFile[] files,
            @RequestParam(value = "threadId", required = false) Long threadId,
            @RequestParam(value = "isInline", defaultValue = "false") boolean isInline
    ) throws IOException {
        Long companyId = TenantContext.getCompanyId() != null ? TenantContext.getCompanyId() : 1L;
        List<TicketAttachment> uploaded = new ArrayList<>();

        for (MultipartFile file : files) {
            if (!file.isEmpty()) {
                TicketAttachment saved = attachmentService.saveAttachment(
                        file,
                        companyId,
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
        return ResponseEntity.ok(attachmentService.getAttachmentsForTicket(ticketId));
    }

    @GetMapping("/attachments/{id}/download")
    public ResponseEntity<Resource> downloadAttachment(@PathVariable Long id) throws IOException {
        TicketAttachment attachment = attachmentService.getAttachmentById(id);
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
        attachmentService.deleteAttachment(id);
        return ResponseEntity.noContent().build();
    }
}

