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
import com.kuwy.helpdesk.tenant.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipInputStream;
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
    private final AttachmentScanner scanner;

    // Supported formats requested by user: png, pdf, jpg, jpeg, txt (and standard office docs)
    private static final Set<String> ALLOWED_EXTENSIONS = new HashSet<>(Arrays.asList(
            "png", "pdf", "jpg", "jpeg", "txt", "gif", "webp", "doc", "docx", "xls", "xlsx", "csv"
    ));

    private static final long MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

    @Transactional(rollbackFor = IOException.class)
    public TicketAttachment saveAttachment(
            MultipartFile file,
            Long companyId,
            Long ticketId,
            Long threadId,
            boolean isInline
    ) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Cannot upload empty file.");
        }

        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("Attachments may be at most 10 MB each.");
        }

        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "document";
        validateFileExtension(originalFilename);

        Ticket ticket = ticketRepository.findById(ticketId)
                .orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        authorizeTicket(ticket, true);
        Company company = ticket.getCompany();
        if (companyId == null || !companyId.equals(company.getId())) throw new SecurityException("Attachment workspace does not match the ticket.");

        TicketThread thread = null;
        if (threadId != null) {
            thread = threadRepository.findById(threadId).orElseThrow(() -> new IllegalArgumentException("Conversation message not found."));
            if (thread.getTicket() == null || !ticketId.equals(thread.getTicket().getId()) || thread.getCompany() == null
                    || !companyId.equals(thread.getCompany().getId())) throw new SecurityException("Attachment message does not belong to this ticket.");
            if ("CUSTOMER".equals(TenantContext.getUserRole()) && (Boolean.TRUE.equals(thread.getIsPrivate())
                    || thread.getSenderType() != TicketThread.SenderType.CUSTOMER
                    || !TenantContext.getUserEmail().equalsIgnoreCase(thread.getFromEmail()))) {
                throw new SecurityException("Customers can attach files only to their own public messages.");
            }
        }

        String mediaType = detectType(file, originalFilename);
        scanner.requireClean(file);

        // Store file via StorageManager (local or Cloudinary)
        StoredFileResult stored = storageManagerService.storeFile(file, company.getId(), ticket.getId());
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCompletion(int status) {
                    if (status != STATUS_COMMITTED) storageManagerService.deleteFile(stored.storagePath(), stored.storageType());
                }
            });
        }

        TicketAttachment attachment = new TicketAttachment();
        attachment.setCompany(company);
        attachment.setTicket(ticket);
        attachment.setThread(thread);
        attachment.setFileName(originalFilename);
        attachment.setFileSizeBytes(file.getSize());
        attachment.setContentType(mediaType);
        attachment.setScanStatus("CLEAN");
        attachment.setStorageType(TicketAttachment.StorageType.valueOf(stored.storageType()));
        attachment.setStoragePath(stored.storagePath());
        attachment.setIsInline(isInline && mediaType.startsWith("image/"));

        TicketAttachment saved = attachmentRepository.save(attachment);
        enrichUrls(saved, stored.directUrl());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<TicketAttachment> getAttachmentsForTicket(Long ticketId) {
        Ticket ticket = ticketRepository.findById(ticketId).orElseThrow(() -> new IllegalArgumentException("Ticket not found."));
        authorizeTicket(ticket, false);
        List<TicketAttachment> list = attachmentRepository.findByTicketIdOrderByCreatedAtAsc(ticketId);
        list = list.stream().filter(attachment -> canRead(attachment, ticket)).toList();
        list.forEach(att -> enrichUrls(att, null));
        return list;
    }

    @Transactional(readOnly = true)
    public List<TicketAttachment> getAttachmentsForThread(Long threadId) {
        TicketThread thread = threadRepository.findById(threadId).orElseThrow(() -> new IllegalArgumentException("Message not found."));
        authorizeTicket(thread.getTicket(), false);
        if ("CUSTOMER".equals(TenantContext.getUserRole()) && Boolean.TRUE.equals(thread.getIsPrivate())) throw new SecurityException("Private message attachments are not available.");
        List<TicketAttachment> list = attachmentRepository.findByThreadIdOrderByCreatedAtAsc(threadId);
        list = list.stream().filter(attachment -> canRead(attachment, thread.getTicket())).toList();
        list.forEach(att -> enrichUrls(att, null));
        return list;
    }

    @Transactional(readOnly = true)
    public TicketAttachment getAttachmentById(Long attachmentId) {
        TicketAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new IllegalArgumentException("Attachment not found."));
        authorizeTicket(attachment.getTicket(), false);
        if (!canRead(attachment, attachment.getTicket())) throw new SecurityException("Attachment is not available to this account.");
        enrichUrls(attachment, null);
        return attachment;
    }

    public Resource getResourceForAttachment(TicketAttachment attachment) throws IOException {
        authorizeTicket(attachment.getTicket(), false);
        if (!canRead(attachment, attachment.getTicket())) throw new SecurityException("Attachment is not available to this account.");
        if (!"CLEAN".equals(attachment.getScanStatus())) throw new IllegalStateException("Attachment is not available until a malware scan succeeds.");
        return storageManagerService.loadFileAsResource(
                attachment.getStoragePath(),
                attachment.getStorageType().name()
        );
    }

    @Transactional
    public void deleteAttachment(Long attachmentId) {
        TicketAttachment attachment = attachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new RuntimeException("Attachment not found: " + attachmentId));
        authorizeTicket(attachment.getTicket(), true);
        TenantContext.assertCompanyAdminAccessTo(attachment.getCompany().getId());
        if (!canRead(attachment, attachment.getTicket())) throw new SecurityException("Attachment ownership mismatch.");
        boolean deleted = storageManagerService.deleteFile(
                attachment.getStoragePath(),
                attachment.getStorageType().name()
        );
        if (!deleted) throw new IllegalStateException("Stored attachment could not be deleted.");
        attachmentRepository.delete(attachment);
    }

    private void enrichUrls(TicketAttachment attachment, String directCloudinaryUrl) {
        attachment.setDownloadUrl("/api/v1/attachments/" + attachment.getId() + "/download");
        attachment.setPreviewUrl("/api/v1/attachments/" + attachment.getId() + "/preview");
    }

    private void validateFileExtension(String fileName) {
        if (fileName == null || fileName.isBlank() || fileName.length() > 180 || fileName.indexOf('/') >= 0 || fileName.indexOf('\\') >= 0
                || fileName.chars().anyMatch(value -> value < 32 || value == 127)) throw new IllegalArgumentException("Provide a valid attachment file name.");
        String lower = fileName.toLowerCase(Locale.ROOT).trim();
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
        String ext = fileName.substring(dot + 1).toLowerCase(Locale.ROOT);
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new IllegalArgumentException("Unsupported file type: ." + ext + ". Allowed formats: png, pdf, jpg, jpeg, txt, doc, docx, xls, xlsx, csv");
        }
    }

    @Transactional(rollbackFor = IOException.class)
    public List<TicketAttachment> saveAttachments(MultipartFile[] files, Long companyId, Long ticketId, Long threadId) throws IOException {
        if (files == null || files.length == 0 || files.length > 10) throw new IllegalArgumentException("Choose between 1 and 10 attachments.");
        long total = 0;
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty() || file.getSize() > MAX_FILE_SIZE_BYTES) throw new IllegalArgumentException("Files must contain data and be at most 10 MB each.");
            total += file.getSize();
        }
        if (total > 25L * 1024 * 1024) throw new IllegalArgumentException("Attachments may total at most 25 MB per upload.");
        List<TicketAttachment> results = new ArrayList<>();
        for (MultipartFile file : files) results.add(saveAttachment(file, companyId, ticketId, threadId, false));
        return results;
    }

    private void authorizeTicket(Ticket ticket, boolean mutation) {
        if (ticket == null || ticket.getCompany() == null) throw new SecurityException("A ticket workspace is required.");
        if ("CUSTOMER".equals(TenantContext.getUserRole())) {
            Long contactId = TenantContext.requireCustomerId(ticket.getCompany().getId());
            if (ticket.getContact() == null || !contactId.equals(ticket.getContact().getId())
                    || !TenantContext.getUserEmail().equalsIgnoreCase(ticket.getContact().getEmail())) throw new SecurityException("Ticket does not belong to this customer.");
        } else {
            TenantContext.assertAccessTo(ticket.getCompany().getId());
            if (mutation && "LIGHT_AGENT".equals(TenantContext.getUserRole())) throw new SecurityException("This staff role is read-only.");
        }
    }

    private boolean canRead(TicketAttachment attachment, Ticket ticket) {
        if (attachment.getCompany() == null || !ticket.getCompany().getId().equals(attachment.getCompany().getId())
                || attachment.getTicket() == null || !ticket.getId().equals(attachment.getTicket().getId())) return false;
        TicketThread thread = attachment.getThread();
        if (thread != null && (thread.getCompany() == null || !attachment.getCompany().getId().equals(thread.getCompany().getId())
                || thread.getTicket() == null || !ticket.getId().equals(thread.getTicket().getId()))) return false;
        return !"CUSTOMER".equals(TenantContext.getUserRole()) || thread == null || (!Boolean.TRUE.equals(thread.getIsPrivate())
                && thread.getSenderType() != TicketThread.SenderType.SYSTEM);
    }

    private String detectType(MultipartFile file, String name) throws IOException {
        String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        byte[] header;
        try (InputStream input = file.getInputStream()) { header = input.readNBytes(16); }
        String ascii = new String(header, StandardCharsets.ISO_8859_1);
        if (extension.equals("png") && starts(header, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
        if (Set.of("jpg", "jpeg").contains(extension) && starts(header, 0xff, 0xd8, 0xff)) return "image/jpeg";
        if (extension.equals("gif") && (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a"))) return "image/gif";
        if (extension.equals("webp") && ascii.startsWith("RIFF") && ascii.length() >= 12 && ascii.substring(8).startsWith("WEBP")) return "image/webp";
        if (extension.equals("pdf") && ascii.startsWith("%PDF-")) return "application/pdf";
        if (Set.of("doc", "xls").contains(extension) && starts(header, 0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return extension.equals("doc") ? "application/msword" : "application/vnd.ms-excel";
        if (Set.of("txt", "csv").contains(extension)) {
            byte[] data = file.getBytes();
            if (data.length > MAX_FILE_SIZE_BYTES) throw new IllegalArgumentException("Attachment is too large.");
            String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString();
            if (text.indexOf(0) < 0) return extension.equals("csv") ? "text/csv" : "text/plain";
        }
        if (Set.of("docx", "xlsx").contains(extension) && starts(header, 0x50, 0x4b, 0x03, 0x04)) {
            boolean content = false, manifest = false;
            long expanded = 0;
            int entries = 0;
            byte[] buffer = new byte[8192];
            try (ZipInputStream zip = new ZipInputStream(file.getInputStream())) {
                java.util.zip.ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    String entryName = entry.getName();
                    if (++entries > 512 || entryName.length() > 300 || entryName.contains("..") || entryName.toLowerCase(Locale.ROOT).endsWith("vbaproject.bin")) throw new IllegalArgumentException("Unsupported or unsafe document package.");
                    manifest |= entryName.equals("[Content_Types].xml");
                    content |= entryName.equals(extension.equals("docx") ? "word/document.xml" : "xl/workbook.xml");
                    int count;
                    while ((count = zip.read(buffer)) >= 0) {
                        expanded += count;
                        if (expanded > 50L * 1024 * 1024) throw new IllegalArgumentException("Expanded document is too large.");
                    }
                }
            }
            if (content && manifest) return extension.equals("docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        }
        throw new IllegalArgumentException("The attachment contents do not match an approved file type.");
    }

    private boolean starts(byte[] value, int... expected) {
        if (value.length < expected.length) return false;
        for (int i = 0; i < expected.length; i++) if ((value[i] & 0xff) != expected[i]) return false;
        return true;
    }
}
