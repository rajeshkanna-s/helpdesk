package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "company_mailboxes")
@Getter
@Setter
@NoArgsConstructor
@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
public class CompanyMailbox {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @JsonIgnore
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "department_id", nullable = false)
    private Department department;

    @Column(name = "mailbox_name", nullable = false, length = 150)
    private String mailboxName;

    @Column(name = "email_address", nullable = false)
    private String emailAddress;

    @Column(name = "forwarding_address")
    private String forwardingAddress;

    @Column(name = "forwarding_verified")
    private Boolean forwardingVerified = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "provider_type", nullable = false)
    private MailProviderType providerType = MailProviderType.MICROSOFT_365;

    @Enumerated(EnumType.STRING)
    @Column(name = "auth_type", nullable = false)
    private AuthType authType = AuthType.OAUTH2_GRAPH_API;

    // Microsoft 365 OAuth 2.0 Credentials
    @Column(name = "ms_tenant_id")
    private String msTenantId;

    @Column(name = "ms_client_id")
    private String msClientId;

    @JsonIgnore
    @Column(name = "ms_client_secret_enc", columnDefinition = "TEXT")
    private String msClientSecretEnc;

    @Column(name = "token_expires_at")
    private LocalDateTime tokenExpiresAt;

    // Real-Time Webhook / Polling Sync
    @Column(name = "graph_subscription_id")
    private String graphSubscriptionId;

    @Column(name = "last_synced_at")
    private LocalDateTime lastSyncedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "sync_status", nullable = false)
    private SyncStatus syncStatus = SyncStatus.CONNECTED;

    @Column(name = "sync_error_details", columnDefinition = "TEXT")
    private String syncErrorDetails;

    @Column(name = "send_as_name", length = 150)
    private String sendAsName = "Support Team";

    @Column(name = "reply_to_address")
    private String replyToAddress;

    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    public enum MailProviderType {
        MICROSOFT_365, EXCHANGE_ONLINE, GOOGLE_WORKSPACE, IMAP_SMTP, FORWARDING
    }

    public enum AuthType {
        OAUTH2_GRAPH_API, OAUTH2_IMAP, BASIC_AUTH, FORWARD_ONLY
    }

    public enum SyncStatus {
        CONNECTED, AUTHENTICATING, AUTH_EXPIRED, ERROR, PAUSED
    }
}
