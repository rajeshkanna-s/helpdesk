package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "ticket_attachments")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class TicketAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    @JsonIgnore
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "ticket_id", nullable = false)
    @JsonIgnore
    private Ticket ticket;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "thread_id")
    @JsonIgnore
    private TicketThread thread;

    @Column(name = "file_name", nullable = false)
    private String fileName;

    @Column(name = "file_size_bytes", nullable = false)
    private Long fileSizeBytes;

    @Column(name = "content_type", nullable = false, length = 120)
    private String contentType;

    @Enumerated(EnumType.STRING)
    @Column(name = "storage_type", nullable = false)
    private StorageType storageType = StorageType.LOCAL_DISK;

    @Column(name = "storage_path", nullable = false, length = 1000)
    @JsonIgnore
    private String storagePath;

    @Column(name = "scan_status", nullable = false, length = 20, columnDefinition = "VARCHAR(20) DEFAULT 'NOT_SCANNED'")
    private String scanStatus = "NOT_SCANNED";

    @Column(name = "is_inline", nullable = false)
    private Boolean isInline = false;

    @Column(name = "content_id")
    private String contentId;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Transient
    private Long ticketId;

    @Transient
    private Long threadId;

    @Transient
    private String downloadUrl;

    @Transient
    private String previewUrl;

    public Long getTicketId() {
        return ticket != null ? ticket.getId() : ticketId;
    }

    public Long getThreadId() {
        return thread != null ? thread.getId() : threadId;
    }

    public enum StorageType {
        LOCAL_DISK, S3, AZURE_BLOB, CLOUDINARY
    }
}
