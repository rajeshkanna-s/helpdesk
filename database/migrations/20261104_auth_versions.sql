-- Apply to the selected application database before deploying the model changes.
-- This migration adds columns only; it does not replace existing user records.
SET @auth_version_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'auth_version'),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN auth_version BIGINT NOT NULL DEFAULT 0'
);
PREPARE auth_version_statement FROM @auth_version_ddl;
EXECUTE auth_version_statement;
DEALLOCATE PREPARE auth_version_statement;

SET @row_version_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'row_version'),
    'SELECT 1',
    'ALTER TABLE users ADD COLUMN row_version BIGINT NOT NULL DEFAULT 0'
);
PREPARE row_version_statement FROM @row_version_ddl;
EXECUTE row_version_statement;
DEALLOCATE PREPARE row_version_statement;

SET @mfa_secret_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns
           WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'two_factor_secret'),
    'ALTER TABLE users MODIFY COLUMN two_factor_secret VARCHAR(512) NULL',
    'ALTER TABLE users ADD COLUMN two_factor_secret VARCHAR(512) NULL'
);
PREPARE mfa_secret_statement FROM @mfa_secret_ddl;
EXECUTE mfa_secret_statement;
DEALLOCATE PREPARE mfa_secret_statement;
