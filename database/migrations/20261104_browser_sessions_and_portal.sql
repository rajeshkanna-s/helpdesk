-- Apply only to the selected application database before deploying session/portal changes.
-- No existing customer records are removed or reassigned.
SET @contact_auth_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'auth_version'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0'
);
PREPARE contact_auth_statement FROM @contact_auth_ddl;
EXECUTE contact_auth_statement;
DEALLOCATE PREPARE contact_auth_statement;

SET @contact_block_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'is_blocked'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN is_blocked BOOLEAN NOT NULL DEFAULT FALSE'
);
PREPARE contact_block_statement FROM @contact_block_ddl;
EXECUTE contact_block_statement;
DEALLOCATE PREPARE contact_block_statement;

SET @scan_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'ticket_attachments' AND column_name = 'scan_status'),
    'SELECT 1', 'ALTER TABLE ticket_attachments ADD COLUMN scan_status VARCHAR(20) NOT NULL DEFAULT ''NOT_SCANNED'''
);
PREPARE scan_statement FROM @scan_ddl;
EXECUTE scan_statement;
DEALLOCATE PREPARE scan_statement;

CREATE TABLE IF NOT EXISTS browser_sessions (
    id CHAR(36) NOT NULL PRIMARY KEY,
    kind VARCHAR(8) NOT NULL,
    subject_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    email VARCHAR(254) NOT NULL,
    role VARCHAR(32) NOT NULL,
    auth_version BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    last_seen_at TIMESTAMP(6) NOT NULL,
    absolute_expires_at TIMESTAMP(6) NOT NULL,
    idle_expires_at TIMESTAMP(6) NOT NULL,
    revoked_at TIMESTAMP(6) NULL,
    refresh_hash CHAR(64) NOT NULL,
    previous_refresh_hash CHAR(64) NULL,
    encrypted_csrf VARCHAR(256) NOT NULL,
    device_label VARCHAR(160) NOT NULL,
    remote_addr VARCHAR(64) NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    INDEX idx_browser_session_subject (subject_id, kind, revoked_at, created_at),
    CONSTRAINT fk_browser_session_company FOREIGN KEY (company_id) REFERENCES companies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_csat (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    company_id BIGINT NOT NULL,
    ticket_id BIGINT NOT NULL,
    contact_id BIGINT NOT NULL,
    rating INT NOT NULL,
    comment VARCHAR(2000) NOT NULL DEFAULT '',
    created_at TIMESTAMP(6) NOT NULL,
    UNIQUE KEY uk_ticket_csat_customer (company_id, ticket_id, contact_id),
    CONSTRAINT fk_ticket_csat_company FOREIGN KEY (company_id) REFERENCES companies(id),
    CONSTRAINT fk_ticket_csat_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id),
    CONSTRAINT fk_ticket_csat_contact FOREIGN KEY (contact_id) REFERENCES contacts(id),
    CONSTRAINT ck_ticket_csat_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
