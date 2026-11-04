-- MySQL 8.0.17+; apply to the selected application database before enabling the catalog.
-- Explicit repository baseline prices in INR, GST exclusive. yearly_price is TOTAL ANNUAL.
-- Additive only: no subscription changes, no replacement of an existing code's terms.
CREATE TABLE IF NOT EXISTS plan_definitions (
    code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    base_tier VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    currency VARCHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    monthly_price DECIMAL(14,2) NOT NULL,
    yearly_price DECIMAL(14,2) NOT NULL,
    included_agents INT NOT NULL,
    ticket_limit_monthly INT NOT NULL,
    trial_days INT NOT NULL,
    storage_bytes BIGINT NOT NULL,
    features_json JSON NOT NULL,
    revision BIGINT NOT NULL DEFAULT 1,
    row_version BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_by_user_id BIGINT NULL,
    INDEX idx_plan_catalog_public (status, monthly_price, code),
    CONSTRAINT ck_plan_code CHECK (REGEXP_LIKE(code, '^[A-Z][A-Z0-9_-]{2,29}$', 'c')),
    CONSTRAINT ck_plan_name CHECK (CHAR_LENGTH(TRIM(display_name)) > 0),
    CONSTRAINT ck_plan_tier CHECK (base_tier IN ('FREE', 'STARTER', 'PRO', 'ENTERPRISE')),
    CONSTRAINT ck_plan_status CHECK (status IN ('DRAFT', 'PUBLIC', 'HIDDEN', 'RETIRED')),
    CONSTRAINT ck_plan_currency CHECK (currency = 'INR'),
    CONSTRAINT ck_plan_prices CHECK (monthly_price >= 0 AND yearly_price >= 0),
    CONSTRAINT ck_plan_agents CHECK (included_agents BETWEEN 1 AND 10000),
    CONSTRAINT ck_plan_tickets CHECK (ticket_limit_monthly BETWEEN 1 AND 10000000),
    CONSTRAINT ck_plan_trial CHECK (trial_days BETWEEN 0 AND 30),
    CONSTRAINT ck_plan_storage CHECK (storage_bytes >= 0),
    CONSTRAINT ck_plan_revision CHECK (revision >= 1 AND row_version >= 0),
    CONSTRAINT ck_plan_actor CHECK (updated_by_user_id IS NULL OR updated_by_user_id > 0),
    CONSTRAINT ck_plan_features CHECK (JSON_SCHEMA_VALID(
        '{"type":"object","maxProperties":10,"additionalProperties":false,"properties":{"mailboxConnect":{"type":"boolean"},"customDomain":{"type":"boolean"},"automation":{"type":"boolean"},"sla":{"type":"boolean"},"macros":{"type":"boolean"},"customFields":{"type":"boolean"},"csat":{"type":"boolean"},"api":{"type":"boolean"},"export":{"type":"boolean"},"branding":{"type":"boolean"}}}',
        features_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS plan_revisions (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    revision BIGINT NOT NULL,
    snapshot_json JSON NOT NULL,
    actor_user_id BIGINT NULL,
    created_at TIMESTAMP(6) NOT NULL,
    UNIQUE KEY uk_plan_revision (code, revision),
    CONSTRAINT fk_plan_revision_code FOREIGN KEY (code) REFERENCES plan_definitions(code),
    CONSTRAINT ck_plan_snapshot_revision CHECK (revision >= 1),
    CONSTRAINT ck_plan_snapshot_actor CHECK (actor_user_id IS NULL OR actor_user_id > 0),
    CONSTRAINT ck_plan_snapshot CHECK (JSON_TYPE(snapshot_json) = 'OBJECT' AND JSON_STORAGE_SIZE(snapshot_json) <= 32768)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Storage was not assigned a baseline allowance: zero is explicit, never an unlimited sentinel.
-- Capability flags are entitlements, not a claim that an integration is configured/operational.
INSERT IGNORE INTO plan_definitions
    (code, display_name, description, base_tier, status, currency, monthly_price, yearly_price,
     included_agents, ticket_limit_monthly, trial_days, storage_bytes, features_json, revision, row_version)
VALUES
    ('FREE', 'Free', 'Basic support for individuals and micro-teams.', 'FREE', 'PUBLIC', 'INR', 0.00, 0.00,
     2, 100, 14, 0,
     '{"mailboxConnect":false,"customDomain":false,"automation":false,"sla":false,"macros":false,"customFields":false,"csat":false,"api":false,"export":false,"branding":false}', 1, 0),
    ('STARTER', 'Starter', 'Support for growing teams with SLA routing and macros.', 'STARTER', 'PUBLIC', 'INR', 2499.00, 23990.40,
     5, 1500, 14, 0,
     '{"mailboxConnect":false,"customDomain":true,"automation":true,"sla":true,"macros":true,"customFields":false,"csat":false,"api":false,"export":true,"branding":true}', 1, 0),
    ('PRO', 'Pro', 'Advanced support with connected mailboxes and custom workflows.', 'PRO', 'PUBLIC', 'INR', 5999.00, 57590.40,
     25, 10000, 14, 0,
     '{"mailboxConnect":true,"customDomain":true,"automation":true,"sla":true,"macros":true,"customFields":true,"csat":true,"api":true,"export":true,"branding":true}', 1, 0),
    ('ENTERPRISE', 'Enterprise', 'Support for larger teams with enterprise capabilities.', 'ENTERPRISE', 'PUBLIC', 'INR', 14999.00, 143990.40,
     50, 100000, 14, 0,
     '{"mailboxConnect":true,"customDomain":true,"automation":true,"sla":true,"macros":true,"customFields":true,"csat":true,"api":true,"export":true,"branding":true}', 1, 0);

-- Snapshot actual stored terms, including preserved pre-existing codes, not hardcoded replacements.
-- NULL actor means migration provenance; never invent an administrator identity for seeded data.
INSERT IGNORE INTO plan_revisions (code, revision, snapshot_json, actor_user_id, created_at)
SELECT code, revision,
    JSON_OBJECT('code', code, 'displayName', display_name, 'description', description, 'baseTier', base_tier,
        'status', status, 'currency', currency, 'gstExclusive', CAST('true' AS JSON),
        'monthlyPrice', monthly_price, 'yearlyPrice', yearly_price, 'includedAgents', included_agents,
        'ticketLimitMonthly', ticket_limit_monthly, 'trialDays', trial_days, 'storageBytes', storage_bytes,
        'features', features_json, 'revision', revision), updated_by_user_id, updated_at
FROM plan_definitions;

-- Re-runs replace only these catalog-owned triggers; stored rows remain untouched.
DROP TRIGGER IF EXISTS plan_revisions_no_update;
DROP TRIGGER IF EXISTS plan_revisions_no_delete;
DROP TRIGGER IF EXISTS plan_definitions_new_revision;
DELIMITER $$
CREATE TRIGGER plan_revisions_no_update BEFORE UPDATE ON plan_revisions FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Plan revisions are immutable'$$
CREATE TRIGGER plan_revisions_no_delete BEFORE DELETE ON plan_revisions FOR EACH ROW
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Plan revisions are immutable'$$
CREATE TRIGGER plan_definitions_new_revision BEFORE UPDATE ON plan_definitions FOR EACH ROW
BEGIN
    IF NEW.code <> OLD.code OR NEW.revision <> OLD.revision + 1 OR NEW.row_version <> OLD.row_version + 1
        OR NEW.updated_by_user_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Plan edits require a new revision and actor';
    END IF;
END$$
DELIMITER ;
