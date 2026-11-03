package com.kuwy.helpdesk.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class DatabaseSchemaInitializer implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        log.info("Checking and applying Section B schema migrations (2FA, Lockouts, Reset Tokens, Invitations, Audit Logs)...");

        try {
            // 1. Ensure required columns on `users` table
            ensureUserColumn("status", "VARCHAR(20) DEFAULT 'ACTIVE'");
            ensureUserColumn("is_two_factor_enabled", "BOOLEAN DEFAULT FALSE");
            ensureUserColumn("two_factor_secret", "VARCHAR(64) DEFAULT NULL");
            ensureUserColumn("backup_codes", "TEXT DEFAULT NULL");
            ensureUserColumn("failed_login_attempts", "INT DEFAULT 0");
            ensureUserColumn("lockout_until", "TIMESTAMP NULL DEFAULT NULL");

            // 2. Ensure `password_reset_tokens` table
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
                    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                    `user_id` BIGINT NOT NULL,
                    `company_id` BIGINT NOT NULL,
                    `email` VARCHAR(255) NOT NULL,
                    `token_hash` VARCHAR(64) NOT NULL,
                    `expires_at` TIMESTAMP NOT NULL,
                    `is_used` BOOLEAN NOT NULL DEFAULT FALSE,
                    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_prt_token_hash` (`token_hash`),
                    INDEX `idx_prt_user` (`user_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);

            // 3. Ensure `agent_invitations` table
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS `agent_invitations` (
                    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                    `company_id` BIGINT NOT NULL,
                    `invited_by_user_id` BIGINT NOT NULL,
                    `email` VARCHAR(255) NOT NULL,
                    `name` VARCHAR(150) NOT NULL,
                    `role_id` BIGINT NOT NULL,
                    `token_hash` VARCHAR(64) NOT NULL,
                    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
                    `expires_at` TIMESTAMP NOT NULL,
                    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX `idx_ai_token_hash` (`token_hash`),
                    INDEX `idx_ai_company` (`company_id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);

            // 4. Ensure `security_audit_logs` table
            jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS `security_audit_logs` (
                    `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                    `company_id` BIGINT DEFAULT NULL,
                    `user_id` BIGINT DEFAULT NULL,
                    `action` VARCHAR(60) NOT NULL,
                    `email` VARCHAR(255) DEFAULT NULL,
                    `ip_address` VARCHAR(60) DEFAULT NULL,
                    `user_agent` VARCHAR(300) DEFAULT NULL,
                    `details` TEXT DEFAULT NULL,
                    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX `idx_sal_company` (`company_id`),
                    INDEX `idx_sal_action` (`action`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """);

            // 5. Ensure company configuration columns for Section E Settings
            ensureCompanyColumn("settings_json", "LONGTEXT DEFAULT NULL");
            ensureCompanyColumn("support_email", "VARCHAR(255) DEFAULT NULL");
            ensureCompanyColumn("support_phone", "VARCHAR(100) DEFAULT NULL");
            ensureCompanyColumn("support_address", "VARCHAR(300) DEFAULT NULL");
            ensureCompanyColumn("legal_name", "VARCHAR(255) DEFAULT NULL");
            ensureCompanyColumn("business_hours_text", "VARCHAR(255) DEFAULT 'Mon - Fri, 9:00 AM - 6:00 PM IST'");
            ensureCompanyColumn("portal_name", "VARCHAR(255) DEFAULT NULL");
            ensureCompanyColumn("portal_welcome_message", "TEXT DEFAULT NULL");
            ensureCompanyColumn("accent_color", "VARCHAR(30) DEFAULT '#6366f1'");
            ensureCompanyColumn("powered_by_badge", "BOOLEAN DEFAULT TRUE");
            ensureCompanyColumn("custom_domain_status", "VARCHAR(40) DEFAULT 'ACTIVE'");

            log.info("Database schema check and updates completed successfully.");
        } catch (Exception e) {
            log.error("Failed to run database schema initializer: {}", e.getMessage(), e);
        }
    }

    private void ensureCompanyColumn(String columnName, String definition) {
        try {
            List<String> columns = jdbcTemplate.query(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'companies' AND column_name = ?",
                    (rs, rowNum) -> rs.getString("column_name"),
                    columnName
            );
            if (columns.isEmpty()) {
                log.info("Adding column '{}' to 'companies' table...", columnName);
                jdbcTemplate.execute("ALTER TABLE `companies` ADD COLUMN `" + columnName + "` " + definition);
                log.info("Column '{}' added to 'companies' successfully.", columnName);
            }
        } catch (Exception e) {
            log.warn("Could not check/add column '{}' to companies table: {}", columnName, e.getMessage());
        }
    }

    private void ensureUserColumn(String columnName, String definition) {
        try {
            List<String> columns = jdbcTemplate.query(
                    "SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = ?",
                    (rs, rowNum) -> rs.getString("column_name"),
                    columnName
            );
            if (columns.isEmpty()) {
                log.info("Adding column '{}' to 'users' table...", columnName);
                jdbcTemplate.execute("ALTER TABLE `users` ADD COLUMN `" + columnName + "` " + definition);
                log.info("Column '{}' added successfully.", columnName);
            }
        } catch (Exception e) {
            log.warn("Could not check/add column '{}' to users table: {}", columnName, e.getMessage());
        }
    }
}

