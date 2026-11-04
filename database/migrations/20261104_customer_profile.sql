-- Apply to the selected application database before deploying the profile fields.
-- Additive only: identity, account membership and existing communication choices are preserved.
SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'organization_name'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN organization_name VARCHAR(150) NULL'
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;

SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'time_zone'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN time_zone VARCHAR(64) NOT NULL DEFAULT ''UTC'''
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;

SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'language'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN language VARCHAR(10) NOT NULL DEFAULT ''en'''
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;

SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'notify_replies'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN notify_replies BOOLEAN NOT NULL DEFAULT TRUE'
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;

SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'notify_resolved'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN notify_resolved BOOLEAN NOT NULL DEFAULT TRUE'
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;

SET @profile_ddl = IF(
    EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE()
           AND table_name = 'contacts' AND column_name = 'notify_surveys'),
    'SELECT 1', 'ALTER TABLE contacts ADD COLUMN notify_surveys BOOLEAN NOT NULL DEFAULT TRUE'
);
PREPARE profile_statement FROM @profile_ddl;
EXECUTE profile_statement;
DEALLOCATE PREPARE profile_statement;
