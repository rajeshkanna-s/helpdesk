package com.kuwy.helpdesk.services;

import com.kuwy.helpdesk.models.Company;
import com.kuwy.helpdesk.models.Ticket;
import com.kuwy.helpdesk.models.TicketAttachment;
import com.kuwy.helpdesk.models.TicketThread;
import com.kuwy.helpdesk.repositories.CompanyRepository;
import com.kuwy.helpdesk.repositories.TicketAttachmentRepository;
import com.kuwy.helpdesk.repositories.TicketRepository;
import com.kuwy.helpdesk.repositories.TicketThreadRepository;
import com.kuwy.helpdesk.services.storage.StorageManagerService;
import com.kuwy.helpdesk.services.storage.StoredFileResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class AttachmentService {

    private final TicketAttachmentRepository attachmentRepository;
    private final TicketRepository ticketRepository;
    private final TicketThreadRepository threadRepository;
    private final CompanyRepository companyRepository;
    private final StorageManagerService storageManagerService;

    // Supported formats requested by user: png, pdf, jpg, jpeg, txt (and standard office docs)
    private static final Set<String> ALLOWED_EXTENSIONS = new HashSet<>(Arrays.asList(
            "png", "pdf", "jpg", "jpeg", "txt", "gif", "webp", "doc", "docx", "xls", "xlsx", "csv"
    ));

    private static final long MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

    @Transactional
    public TicketAttachment saveAttachment(
            MultipartFile file,
            Long companyId,
            Long ticketId,
            Long threadId,
            boolean isInline
    ) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Cannot upload empty file.");
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File size exceeds 25MB limit: " + file.getOriginalFilename());
        }

        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "document";
        validateFileExtension(originalFilename);

        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new RuntimeException("Ticket not found: " + ticketId));

        Company company = (companyId != null)
                ? companyRepository.findById(companyId).orElse(ticket.getCompany())
                : ticket.getCompany();

        TicketThread thread = null;
        if (threadId != null) {
            thread = threadRepository.findById(threadId).orElse(null);
        }

        // Store file via StorageManager (local or Cloudinary)
        StoredFileResult stored = storageManagerService.storeFile(file, company.getId(), ticket.getId());

        TicketAttachment attachment = new TicketAttachment();
        attachment.setCompany(company);
        attachment.setTicket(ticket);
        attachment.setThread(thread);
        attachment.setFileName(originalFilename);
        attachment.setFileSizeBytes(file.getSize());
        attachment.setContentType(stored.contentType());
        attachment.setStorageType(TicketAttachment.StorageType.valueOf(stored.storageType()));
        attachment.setStoragePath(stored.storagePath());
        attachment.setIsInline(isInline);

        TicketAttachment saved = attachmentRepository.save(attachment);
        enrichUrls(saved, stored.directUrl());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<TicketAttachment> getAttachmentsForTicket(Long ticketId) {
        List<TicketAttachment> list = attachmentRepository.findByTicketIdOrderByCreatedAtAsc(ticketId);
        list.forEach(att -> enrichUrls(att, null));
        return list;
    }

    @Transactional(readOnly = true)
    public List<TicketAttachment> getAttachmentsForThread(Long threadId) {
        List<TicketAttachment> list = attachmentRepository.findByThreadIdOrderByCreatedAtAsc(threadId);
        list.forEach(att -> enrichUrls(att, null));
        return list;
    }

    @Transactional(readOnly = true)
    public TicketAttachment getAttachmentById(Long attachmentId) {
        TicketAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new RuntimeException("Attachment not found: " + attachmentId));
        enrichUrls(attachment, null);
        return attachment;
    }

    public Resource getResourceForAttachment(TicketAttachment attachment) throws IOException {
        return storageManagerService.loadFileAsResource(
                attachment.getStoragePath(),
                attachment.getStorageType().name()
        );
    }

    @Transactional
    public void deleteAttachment(Long attachmentId) {
        TicketAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new RuntimeException("Attachment not found: " + attachmentId));

        storageManagerService.deleteFile(
                attachment.getStoragePath(),
                attachment.getStorageType().name()
        );

        attachmentRepository.delete(attachment);
    }

    private void enrichUrls(TicketAttachment attachment, String directCloudinaryUrl) {
        if (StringUtils.hasText(directCloudinaryUrl)) {
            attachment.setDownloadUrl(directCloudinaryUrl);
            attachment.setPreviewUrl(directCloudinaryUrl);
        } else if (attachment.getStorageType() == TicketAttachment.StorageType.CLOUDINARY &&
                   attachment.getStoragePath().startsWith("http")) {
            attachment.setDownloadUrl(attachment.getStoragePath());
            attachment.setPreviewUrl(attachment.getStoragePath());
        } else {
            attachment.setDownloadUrl("/api/v1/attachments/" + attachment.getId() + "/download");
            attachment.setPreviewUrl("/api/v1/attachments/" + attachment.getId() + "/preview");
        }
    }

    private void validateFileExtension(String fileName) {
        String lower = fileName.toLowerCase().trim();
        // Disallow dangerous executable extensions and double extensions
        for (String danger : Arrays.asList(".exe", ".bat", ".cmd", ".sh", ".php", ".jsp", ".asp", ".aspx", ".jar", ".vbs", ".ps1", ".scr", ".pif")) {
            if (lower.contains(danger)) {
                throw new IllegalArgumentException("Executable and script files are strictly blocked for security.");
            }
        }
        int dot = fileName.lastIndexOf('.');
        if (dot < 0) {
            throw new IllegalArgumentException("File must have a valid extension (.png, .pdf, .jpg, .txt, etc.)");
        }
        String ext = fileName.substring(dot + 1).toLowerCase();
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("Unsupported file type: ." + ext + ". Allowed formats: png, pdf, jpg, jpeg, txt, doc, docx, xls, xlsx, csv");
        }
    }
}

