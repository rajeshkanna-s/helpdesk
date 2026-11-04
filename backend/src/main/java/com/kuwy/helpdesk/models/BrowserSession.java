package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "browser_sessions", indexes = {
        @Index(name = "idx_browser_session_subject", columnList = "subject_id,kind,revoked_at,created_at")
})
@Getter
@Setter
@NoArgsConstructor
public class BrowserSession {
    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(length = 36, nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 8, updatable = false)
    private String kind;
    @Column(name = "subject_id", nullable = false, updatable = false)
    private Long subjectId;
    @Column(name = "company_id", nullable = false, updatable = false)
    private Long companyId;
    @Column(nullable = false, length = 254, updatable = false)
    private String email;
    @Column(nullable = false, length = 32, updatable = false)
    private String role;
    @Column(name = "auth_version", nullable = false, updatable = false)
    private Long authVersion;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
    @Column(name = "last_seen_at", nullable = false)
    private Instant lastSeenAt;
    @Column(name = "absolute_expires_at", nullable = false, updatable = false)
    private Instant absoluteExpiresAt;
    @Column(name = "idle_expires_at", nullable = false)
    private Instant idleExpiresAt;
    @Column(name = "revoked_at")
    private Instant revokedAt;

    @JsonIgnore
    @Column(name = "refresh_hash", nullable = false, length = 64, columnDefinition = "CHAR(64)")
    private String refreshHash;
    @JsonIgnore
    @Column(name = "previous_refresh_hash", length = 64, columnDefinition = "CHAR(64)")
    private String previousRefreshHash;
    @JsonIgnore
    @Column(name = "encrypted_csrf", nullable = false, length = 256)
    private String encryptedCsrf;
    @Column(name = "device_label", nullable = false, length = 160, updatable = false)
    private String deviceLabel;
    @Column(name = "remote_addr", nullable = false, length = 64, updatable = false)
    private String remoteAddr;

    @JsonIgnore
    @Version
    @Column(name = "row_version", nullable = false)
    private Long rowVersion;
}
