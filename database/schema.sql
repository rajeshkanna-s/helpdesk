-- ========================================================================
-- KUWY HELPDESK - MULTI-TENANT ENTERPRISE TICKETING DATABASE SCHEMA
-- Compatible with MySQL 8.0+ / MariaDB 10.5+
-- Optimized for Java 21 / Spring Boot 3 / React Frontend Architecture
-- Supports Multi-Company Isolation & Microsoft 365 (Graph API / OAuth) Ingestion
-- ========================================================================

CREATE DATABASE IF NOT EXISTS `kuwy_helpdesk`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `kuwy_helpdesk`;

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------
-- 1. MULTI-TENANCY / COMPANIES (Organizations)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `companies`;
CREATE TABLE `companies` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_code` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Unique identifier, e.g. KUWY, ACME',
  `name` VARCHAR(255) NOT NULL,
  `subdomain` VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. kuwy.helpdesk.com',
  `custom_domain` VARCHAR(255) DEFAULT NULL,
  `logo_url` VARCHAR(500) DEFAULT NULL,
  `primary_color` VARCHAR(20) DEFAULT '#0d6efd',
  `timezone` VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  `default_language` VARCHAR(10) NOT NULL DEFAULT 'en',
  `status` ENUM('ACTIVE', 'TRIAL', 'SUSPENDED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  `plan_name` VARCHAR(50) NOT NULL DEFAULT 'ENTERPRISE',
  `max_agents` INT NOT NULL DEFAULT 50,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_companies_status` (`status`),
  INDEX `idx_companies_subdomain` (`subdomain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 2. DEPARTMENTS (Company-specific units, e.g., IT, Operations, Billing)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `departments`;
CREATE TABLE `departments` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `code` VARCHAR(50) DEFAULT NULL,
  `description` TEXT DEFAULT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  INDEX `idx_departments_company` (`company_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 3. ROLES & PERMISSIONS (RBAC)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `roles`;
CREATE TABLE `roles` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT DEFAULT NULL COMMENT 'NULL for system-wide default roles',
  `name` VARCHAR(100) NOT NULL,
  `role_type` ENUM('SUPER_ADMIN', 'COMPANY_ADMIN', 'TEAM_LEAD', 'AGENT', 'LIGHT_AGENT', 'CUSTOMER') NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `is_system_role` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  INDEX `idx_roles_company` (`company_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `permissions`;
CREATE TABLE `permissions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `permission_key` VARCHAR(100) NOT NULL UNIQUE COMMENT 'e.g. ticket:read, ticket:write, mailbox:manage',
  `category` VARCHAR(50) NOT NULL COMMENT 'TICKETS, USERS, CHANNELS, SETTINGS, REPORTS',
  `description` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `role_permissions`;
CREATE TABLE `role_permissions` (
  `role_id` BIGINT NOT NULL,
  `permission_id` BIGINT NOT NULL,
  PRIMARY KEY (`role_id`, `permission_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 4. USERS (Support Agents, Team Leads, Company Admins)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `auth_version` BIGINT NOT NULL DEFAULT 0,
  `row_version` BIGINT NOT NULL DEFAULT 0,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) DEFAULT NULL,
  `display_name` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `role_id` BIGINT NOT NULL,
  `primary_department_id` BIGINT DEFAULT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `is_verified` BOOLEAN NOT NULL DEFAULT TRUE,
  `status` VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  `is_two_factor_enabled` BOOLEAN NOT NULL DEFAULT FALSE,
  `two_factor_secret` VARCHAR(512) DEFAULT NULL,
  `backup_codes` TEXT,
  `failed_login_attempts` INT NOT NULL DEFAULT 0,
  `lockout_until` TIMESTAMP NULL DEFAULT NULL,
  `last_login_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_user_company_email` (`company_id`, `email`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`),
  FOREIGN KEY (`primary_department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  INDEX `idx_users_company_active` (`company_id`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `user_departments`;
CREATE TABLE `user_departments` (
  `user_id` BIGINT NOT NULL,
  `department_id` BIGINT NOT NULL,
  PRIMARY KEY (`user_id`, `department_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 5. ACCOUNTS & CONTACTS (End-Users / Customers who submit tickets)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `customer_accounts`;
CREATE TABLE `customer_accounts` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `account_name` VARCHAR(255) NOT NULL,
  `website` VARCHAR(255) DEFAULT NULL,
  `phone` VARCHAR(50) DEFAULT NULL,
  `industry` VARCHAR(100) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  INDEX `idx_customer_acc_company` (`company_id`, `account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `contacts`;
CREATE TABLE `contacts` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `account_id` BIGINT DEFAULT NULL,
  `first_name` VARCHAR(100) NOT NULL,
  `last_name` VARCHAR(100) DEFAULT NULL,
  `email` VARCHAR(255) NOT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `is_portal_user` BOOLEAN NOT NULL DEFAULT FALSE,
  `password_hash` VARCHAR(255) DEFAULT NULL,
  `avatar_url` VARCHAR(500) DEFAULT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_contact_company_email` (`company_id`, `email`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`account_id`) REFERENCES `customer_accounts` (`id`) ON DELETE SET NULL,
  INDEX `idx_contacts_lookup` (`company_id`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 6. MICROSOFT 365 / EMAIL MAILBOXES (Per-Company Ingestion Configuration)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `company_mailboxes`;
CREATE TABLE `company_mailboxes` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `department_id` BIGINT NOT NULL,
  `mailbox_name` VARCHAR(150) NOT NULL COMMENT 'e.g. Kuwy IT Support, Billing Desk',
  `email_address` VARCHAR(255) NOT NULL COMMENT 'e.g. support@kuwy.in',
  `forwarding_address` VARCHAR(255) DEFAULT NULL COMMENT 'e.g. 1281753993@tickets.helpdesk.com',
  `forwarding_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `provider_type` ENUM('MICROSOFT_365', 'EXCHANGE_ONLINE', 'GOOGLE_WORKSPACE', 'IMAP_SMTP', 'FORWARDING') NOT NULL DEFAULT 'MICROSOFT_365',
  `auth_type` ENUM('OAUTH2_GRAPH_API', 'OAUTH2_IMAP', 'BASIC_AUTH', 'FORWARD_ONLY') NOT NULL DEFAULT 'OAUTH2_GRAPH_API',

  -- Microsoft 365 / Azure AD OAuth Credentials
  `ms_tenant_id` VARCHAR(255) DEFAULT NULL COMMENT 'Azure AD Directory / Tenant ID',
  `ms_client_id` VARCHAR(255) DEFAULT NULL COMMENT 'Azure Application Client ID',
  `ms_client_secret_enc` TEXT DEFAULT NULL COMMENT 'AES-256 Encrypted App Secret',
  `ms_access_token_enc` MEDIUMTEXT DEFAULT NULL,
  `ms_refresh_token_enc` MEDIUMTEXT DEFAULT NULL,
  `token_expires_at` TIMESTAMP NULL DEFAULT NULL,

  -- Real-Time Webhook / Polling Sync Management
  `graph_subscription_id` VARCHAR(255) DEFAULT NULL COMMENT 'MS Graph change notification subscription ID',
  `subscription_expires_at` TIMESTAMP NULL DEFAULT NULL,
  `delta_token` TEXT DEFAULT NULL COMMENT 'MS Graph delta synchronization bookmark',
  `last_synced_at` TIMESTAMP NULL DEFAULT NULL,
  `sync_status` ENUM('CONNECTED', 'AUTHENTICATING', 'AUTH_EXPIRED', 'ERROR', 'PAUSED') NOT NULL DEFAULT 'CONNECTED',
  `sync_error_details` TEXT DEFAULT NULL,

  -- Outgoing Mail & Routing Settings
  `send_as_name` VARCHAR(150) NOT NULL DEFAULT 'Support Team',
  `reply_to_address` VARCHAR(255) DEFAULT NULL,
  `auto_create_contacts` BOOLEAN NOT NULL DEFAULT TRUE,
  `default_priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_company_mailbox_email` (`company_id`, `email_address`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT,
  INDEX `idx_mailbox_status` (`sync_status`, `is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 7. SLA POLICIES & BUSINESS HOURS
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `business_hours`;
CREATE TABLE `business_hours` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `timezone` VARCHAR(60) NOT NULL DEFAULT 'Asia/Kolkata',
  `schedule_json` JSON NOT NULL COMMENT 'Defines active days and working hours',
  `is_default` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `sla_policies`;
CREATE TABLE `sla_policies` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  `business_hours_id` BIGINT DEFAULT NULL,
  `is_default` BOOLEAN NOT NULL DEFAULT FALSE,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`business_hours_id`) REFERENCES `business_hours` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `sla_targets`;
CREATE TABLE `sla_targets` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `sla_policy_id` BIGINT NOT NULL,
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL,
  `first_response_time_minutes` INT NOT NULL,
  `resolution_time_minutes` INT NOT NULL,
  `escalate_after_minutes` INT DEFAULT NULL,
  `escalate_to_user_id` BIGINT DEFAULT NULL,
  FOREIGN KEY (`sla_policy_id`) REFERENCES `sla_policies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`escalate_to_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  UNIQUE KEY `uk_sla_target_priority` (`sla_policy_id`, `priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 8. TICKETS (Core Helpdesk Entity)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `tickets`;
CREATE TABLE `tickets` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `ticket_number` VARCHAR(50) NOT NULL COMMENT 'Company-scoped code e.g. KUWY-1001',
  `department_id` BIGINT NOT NULL,
  `contact_id` BIGINT NOT NULL COMMENT 'Requester / customer contact',
  `assigned_agent_id` BIGINT DEFAULT NULL COMMENT 'Assigned staff user',
  `sla_policy_id` BIGINT DEFAULT NULL,
  `source_mailbox_id` BIGINT DEFAULT NULL,
  `channel` ENUM('EMAIL', 'MICROSOFT_365', 'WEB_PORTAL', 'CHAT', 'PHONE', 'API') NOT NULL DEFAULT 'MICROSOFT_365',

  -- Content
  `subject` VARCHAR(500) NOT NULL,
  `description_html` LONGTEXT DEFAULT NULL,
  `description_text` LONGTEXT DEFAULT NULL,

  -- Status & Prioritization
  `status` ENUM('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED', 'SPAM') NOT NULL DEFAULT 'OPEN',
  `priority` ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',

  -- Microsoft 365 / Email Threading Identity (Crucial for conversation matching!)
  `internet_message_id` VARCHAR(255) DEFAULT NULL COMMENT 'RFC 822 Message-ID e.g. <abc@outlook.com>',
  `ms_conversation_id` VARCHAR(255) DEFAULT NULL COMMENT 'Microsoft Graph Conversation ID',
  `in_reply_to` VARCHAR(500) DEFAULT NULL,
  `email_references` TEXT DEFAULT NULL,

  -- SLA Timers & Status
  `first_response_due_at` TIMESTAMP NULL DEFAULT NULL,
  `first_response_at` TIMESTAMP NULL DEFAULT NULL,
  `resolution_due_at` TIMESTAMP NULL DEFAULT NULL,
  `resolved_at` TIMESTAMP NULL DEFAULT NULL,
  `closed_at` TIMESTAMP NULL DEFAULT NULL,
  `sla_status` ENUM('WITHIN_SLA', 'NEARING_BREACH', 'BREACHED', 'EXEMPT') NOT NULL DEFAULT 'WITHIN_SLA',

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY `uk_ticket_company_number` (`company_id`, `ticket_number`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`),
  FOREIGN KEY (`contact_id`) REFERENCES `contacts` (`id`),
  FOREIGN KEY (`assigned_agent_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sla_policy_id`) REFERENCES `sla_policies` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`source_mailbox_id`) REFERENCES `company_mailboxes` (`id`) ON DELETE SET NULL,

  -- High-Performance Composite Indexes for Multi-Tenant Filtering
  INDEX `idx_tickets_company_status` (`company_id`, `status`),
  INDEX `idx_tickets_company_agent` (`company_id`, `assigned_agent_id`, `status`),
  INDEX `idx_tickets_company_dept` (`company_id`, `department_id`, `status`),
  INDEX `idx_tickets_company_contact` (`company_id`, `contact_id`),
  INDEX `idx_tickets_company_ms_conv` (`company_id`, `ms_conversation_id`),
  INDEX `idx_tickets_company_msg_id` (`company_id`, `internet_message_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 9. TICKET THREADS / MESSAGES (Public Replies & Private Internal Notes)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `ticket_threads`;
CREATE TABLE `ticket_threads` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `ticket_id` BIGINT NOT NULL,
  `thread_type` ENUM('REPLY', 'CUSTOMER_REPLY', 'PRIVATE_NOTE', 'FORWARD', 'SYSTEM') NOT NULL DEFAULT 'REPLY',
  `sender_type` ENUM('AGENT', 'CUSTOMER', 'SYSTEM') NOT NULL,
  `sender_user_id` BIGINT DEFAULT NULL COMMENT 'Populated if sender is staff',
  `sender_contact_id` BIGINT DEFAULT NULL COMMENT 'Populated if sender is customer',
  `from_email` VARCHAR(255) NOT NULL,
  `from_name` VARCHAR(255) NOT NULL,
  `to_emails` TEXT DEFAULT NULL,
  `cc_emails` TEXT DEFAULT NULL,
  `bcc_emails` TEXT DEFAULT NULL,
  `subject` VARCHAR(500) DEFAULT NULL,
  `body_html` LONGTEXT NOT NULL,
  `body_text` LONGTEXT DEFAULT NULL,

  -- Email Headers for Thread Ingestion
  `internet_message_id` VARCHAR(255) DEFAULT NULL,
  `ms_graph_message_id` VARCHAR(255) DEFAULT NULL,
  `is_private` BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'True for internal notes visible only to agents',

  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  FOREIGN KEY (`sender_contact_id`) REFERENCES `contacts` (`id`) ON DELETE SET NULL,

  INDEX `idx_threads_ticket` (`ticket_id`, `created_at`),
  INDEX `idx_threads_company` (`company_id`, `ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 10. ATTACHMENTS (Email & Web Uploads)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `ticket_attachments`;
CREATE TABLE `ticket_attachments` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `ticket_id` BIGINT NOT NULL,
  `thread_id` BIGINT DEFAULT NULL,
  `file_name` VARCHAR(255) NOT NULL,
  `file_size_bytes` BIGINT NOT NULL,
  `content_type` VARCHAR(120) NOT NULL,
  `storage_type` ENUM('LOCAL_DISK', 'S3', 'AZURE_BLOB', 'CLOUDINARY') NOT NULL DEFAULT 'LOCAL_DISK',
  `storage_path` VARCHAR(1000) NOT NULL,
  `is_inline` BOOLEAN NOT NULL DEFAULT FALSE,
  `content_id` VARCHAR(255) DEFAULT NULL COMMENT 'CID reference for embedded HTML images',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`thread_id`) REFERENCES `ticket_threads` (`id`) ON DELETE CASCADE,
  INDEX `idx_attachments_thread` (`thread_id`),
  INDEX `idx_attachments_ticket` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 11. TAGS & CUSTOM FIELDS
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `tags`;
CREATE TABLE `tags` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `color_hex` VARCHAR(10) NOT NULL DEFAULT '#6c757d',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_tags_company_name` (`company_id`, `name`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `ticket_tags`;
CREATE TABLE `ticket_tags` (
  `ticket_id` BIGINT NOT NULL,
  `tag_id` BIGINT NOT NULL,
  PRIMARY KEY (`ticket_id`, `tag_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`) REFERENCES `tags` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `custom_field_definitions`;
CREATE TABLE `custom_field_definitions` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `field_label` VARCHAR(100) NOT NULL,
  `field_key` VARCHAR(100) NOT NULL,
  `field_type` ENUM('TEXT', 'NUMBER', 'DROPDOWN', 'CHECKBOX', 'DATE') NOT NULL DEFAULT 'TEXT',
  `is_required` BOOLEAN NOT NULL DEFAULT FALSE,
  `options_json` JSON DEFAULT NULL COMMENT 'Options for dropdown lists',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_cf_company_key` (`company_id`, `field_key`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `ticket_custom_field_values`;
CREATE TABLE `ticket_custom_field_values` (
  `ticket_id` BIGINT NOT NULL,
  `field_definition_id` BIGINT NOT NULL,
  `field_value` TEXT DEFAULT NULL,
  PRIMARY KEY (`ticket_id`, `field_definition_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`field_definition_id`) REFERENCES `custom_field_definitions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 12. TICKET AUDIT LOG / ACTIVITY HISTORY
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `ticket_audit_logs`;
CREATE TABLE `ticket_audit_logs` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `ticket_id` BIGINT NOT NULL,
  `actor_type` ENUM('USER', 'CONTACT', 'SYSTEM') NOT NULL,
  `actor_id` BIGINT DEFAULT NULL,
  `actor_name` VARCHAR(150) NOT NULL,
  `action` VARCHAR(100) NOT NULL COMMENT 'STATUS_UPDATED, ASSIGNED, PRIORITY_CHANGED, THREAD_ADDED, SLA_BREACH',
  `field_name` VARCHAR(100) DEFAULT NULL,
  `old_value` TEXT DEFAULT NULL,
  `new_value` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  INDEX `idx_audit_ticket` (`ticket_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 13. NOTIFICATIONS (Internal Agent Alerts)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `notifications`;
CREATE TABLE `notifications` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `ticket_id` BIGINT DEFAULT NULL,
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NOT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  INDEX `idx_notifications_user` (`user_id`, `is_read`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 14. KNOWLEDGE BASE (Help Center Articles per Company)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS `kb_categories`;
CREATE TABLE `kb_categories` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `icon` VARCHAR(100) DEFAULT 'folder',
  `display_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_kb_cat_company_slug` (`company_id`, `slug`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `kb_articles`;
CREATE TABLE `kb_articles` (
  `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
  `company_id` BIGINT NOT NULL,
  `category_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `content_html` LONGTEXT NOT NULL,
  `status` ENUM('DRAFT', 'PUBLISHED', 'ARCHIVED') NOT NULL DEFAULT 'PUBLISHED',
  `view_count` INT NOT NULL DEFAULT 0,
  `helpful_votes` INT NOT NULL DEFAULT 0,
  `unhelpful_votes` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_kb_art_company_slug` (`company_id`, `slug`),
  FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `kb_categories` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`author_id`) REFERENCES `users` (`id`),
  INDEX `idx_kb_articles_company` (`company_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ------------------------------------------------------------------------
-- 15. SAAS SUBSCRIPTIONS & BILLING
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS company_subscriptions;
CREATE TABLE company_subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  plan_tier ENUM('FREE', 'STARTER', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'STARTER',
  billing_cycle ENUM('MONTHLY', 'ANNUAL') NOT NULL DEFAULT 'MONTHLY',
  amount DECIMAL(10,2) NOT NULL DEFAULT 2999.00,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  gateway_provider VARCHAR(50) DEFAULT 'RAZORPAY',
  gateway_subscription_id VARCHAR(100) DEFAULT NULL,
  agent_limit INT NOT NULL DEFAULT 5,
  ticket_limit_monthly INT NOT NULL DEFAULT 1000,
  status ENUM('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
  current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  grace_period_ends_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_sub_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 16. CANNED RESPONSES & MACROS
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS canned_responses;
CREATE TABLE canned_responses (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  department_id BIGINT DEFAULT NULL,
  title VARCHAR(150) NOT NULL,
  shortcut VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  is_shared BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_canned_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 17. AUTOMATION & ROUTING RULES
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS automation_rules;
CREATE TABLE automation_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
name VARCHAR(150) NOT NULL,
  event_trigger ENUM('TICKET_CREATED', 'TICKET_UPDATED', 'CUSTOMER_REPLIED', 'SLA_BREACHED', 'TIME_INACTIVE') NOT NULL,
  condition_json JSON DEFAULT NULL,
  action_json JSON DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority_order INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_auto_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 18. EMAIL TEMPLATES
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS email_templates;
CREATE TABLE email_templates (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  template_type ENUM('TICKET_CREATED_CONFIRMATION', 'AGENT_REPLY', 'TICKET_RESOLVED', 'TICKET_CLOSED', 'CUSTOMER_OTP') NOT NULL,
  subject_template VARCHAR(255) NOT NULL,
  body_html TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_tpl_company (company_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------
-- 19. CUSTOMER AUTH TOKENS (Magic Link / OTP)
-- ------------------------------------------------------------------------
DROP TABLE IF EXISTS customer_auth_tokens;
CREATE TABLE customer_auth_tokens (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(10) NOT NULL,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  INDEX idx_auth_token (token),
  INDEX idx_auth_email (company_id, email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;


