package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "ticket_threads")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class TicketThread {

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

    @Enumerated(EnumType.STRING)
    @Column(name = "thread_type", nullable = false)
    private ThreadType threadType = ThreadType.REPLY;

    @Enumerated(EnumType.STRING)
    @Column(name = "sender_type", nullable = false)
    private SenderType senderType;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "sender_user_id")
    private User senderUser;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "sender_contact_id")
    private Contact senderContact;

    @Column(name = "from_email", nullable = false)
    private String fromEmail;

    @Column(name = "from_name", nullable = false)
    private String fromName;

    @Column(name = "to_emails", columnDefinition = "TEXT")
    private String toEmails;

    @Column(name = "cc_emails", columnDefinition = "TEXT")
    private String ccEmails;

    @Column(length = 500)
    private String subject;

    @Column(name = "body_html", nullable = false, columnDefinition = "LONGTEXT")
    private String bodyHtml;

    @Column(name = "body_text", columnDefinition = "LONGTEXT")
    private String bodyText;

    @Column(name = "internet_message_id")
    private String internetMessageId;

    @Column(name = "ms_graph_message_id")
    private String msGraphMessageId;

    @Column(name = "is_private", nullable = false)
    private Boolean isPrivate = false;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Transient
    private List<TicketAttachment> attachments = new ArrayList<>();

    public enum ThreadType {
        REPLY, CUSTOMER_REPLY, PRIVATE_NOTE, FORWARD, SYSTEM
    }

    public enum SenderType {
        AGENT, CUSTOMER, SYSTEM
    }
}
