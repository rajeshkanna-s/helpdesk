-- Apply to the selected application database. No existing records are replaced.
CREATE TABLE IF NOT EXISTS account_email_outbox (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    company_id BIGINT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    encrypted_payload TEXT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    next_attempt_at TIMESTAMP(6) NOT NULL,
    attempt_count INT NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'QUEUED',
    last_error_code VARCHAR(32) NULL,
    UNIQUE KEY uk_account_email_idempotency (idempotency_key),
    INDEX idx_account_email_due (status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
