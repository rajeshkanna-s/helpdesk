CREATE TABLE IF NOT EXISTS signup_challenges (
    id CHAR(36) NOT NULL PRIMARY KEY,
    email VARCHAR(254) NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    sent_at TIMESTAMP(6) NOT NULL,
    consumed_at TIMESTAMP(6) NULL,
    attempts INT NOT NULL DEFAULT 0,
    row_version BIGINT NOT NULL DEFAULT 0,
    UNIQUE KEY uk_signup_challenge_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
