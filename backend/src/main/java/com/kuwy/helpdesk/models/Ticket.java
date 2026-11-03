package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "tickets")
@Getter
@Setter
@NoArgsConstructor
public class Ticket {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "company_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private Company company;

    @Column(name = "ticket_number", nullable = false, length = 50)
    private String ticketNumber;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "contact_id", nullable = false)
    private Contact contact;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "assigned_agent_id")
    private User assignedAgent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sla_policy_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "company"})
    private SlaPolicy slaPolicy;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_mailbox_id")
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler", "company", "oauthClientSecret"})
    private CompanyMailbox sourceMailbox;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketChannel channel = TicketChannel.MICROSOFT_365;

    @Column(nullable = false, length = 500)
    private String subject;

    @Column(name = "description_html", columnDefinition = "LONGTEXT")
    private String descriptionHtml;

    @Column(name = "description_text", columnDefinition = "LONGTEXT")
    private String descriptionText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketStatus status = TicketStatus.OPEN;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TicketPriority priority = TicketPriority.MEDIUM;

    // Email / Microsoft 365 Threading Headers
    @Column(name = "internet_message_id")
    private String internetMessageId;

    @Column(name = "ms_conversation_id")
    private String msConversationId;

    @Column(name = "in_reply_to", length = 500)
    private String inReplyTo;

    // SLA tracking
    @Column(name = "first_response_due_at")
    private LocalDateTime firstResponseDueAt;

    @Column(name = "first_response_at")
    private LocalDateTime firstResponseAt;

    @Column(name = "resolution_due_at")
    private LocalDateTime resolutionDueAt;

    @Column(name = "resolved_at")
    private LocalDateTime resolvedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "sla_status", nullable = false)
    private SlaStatus slaStatus = SlaStatus.WITHIN_SLA;

    @Column(name = "created_at", insertable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private LocalDateTime updatedAt;

    @ManyToMany(fetch = FetchType.EAGER)
    @JoinTable(
        name = "ticket_tags",
        joinColumns = @JoinColumn(name = "ticket_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    private Set<Tag> tags = new HashSet<>();

    @com.fasterxml.jackson.annotation.JsonIgnore
    @OneToMany(mappedBy = "ticket", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @OrderBy("createdAt ASC")
    private List<TicketThread> threads = new ArrayList<>();

    public enum TicketStatus {
        OPEN, IN_PROGRESS, WAITING_ON_CUSTOMER, WAITING_ON_THIRD_PARTY, RESOLVED, CLOSED, SPAM
    }

    public enum TicketPriority {
        LOW, MEDIUM, HIGH, URGENT
    }

    public enum TicketChannel {
        EMAIL, MICROSOFT_365, WEB_PORTAL, CHAT, PHONE, API
    }

    public enum SlaStatus {
        WITHIN_SLA, NEARING_BREACH, BREACHED, EXEMPT
    }
}
