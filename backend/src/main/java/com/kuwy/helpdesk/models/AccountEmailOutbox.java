package com.kuwy.helpdesk.models;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "account_email_outbox", indexes =
        @Index(name = "idx_account_email_due", columnList = "status,next_attempt_at"))
@Getter
@Setter
@NoArgsConstructor
public class AccountEmailOutbox {
    public enum DeliveryStatus { QUEUED, PROCESSING, SENT, FAILED }
    public enum ErrorCode { DELIVERY_FAILED }

    @Id
    @Column(name = "id", length = 36, nullable = false, updatable = false)
    private String id;

    @Column(name = "company_id", updatable = false)
    private Long companyId;

    @Column(name = "idempotency_key", length = 128, nullable = false, unique = true, updatable = false)
    private String idempotencyKey;

    @JsonIgnore
    @Column(name = "encrypted_payload", nullable = false, columnDefinition = "TEXT", updatable = false)
    private String encryptedPayload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "attempt_count", nullable = false)
    private int attemptCount;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 16, nullable = false, columnDefinition = "VARCHAR(16)")
    private DeliveryStatus status = DeliveryStatus.QUEUED;

    @Enumerated(EnumType.STRING)
    @Column(name = "last_error_code", length = 32, columnDefinition = "VARCHAR(32)")
    private ErrorCode lastErrorCode;
}
