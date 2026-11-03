import os
import sys
import pymysql

def get_connection():
    host = os.getenv('MYSQL_HOST', 'localhost')
    port = int(os.getenv('MYSQL_PORT', '3306'))
    user = os.getenv('MYSQL_USER', 'root')
    password = os.getenv('MYSQL_PASSWORD', '')
    database = os.getenv('MYSQL_DATABASE', 'kuwy_helpdesk')

    try:
        return pymysql.connect(
            host=host, port=port, user=user, password=password,
            database=database, autocommit=True, charset='utf8mb4'
        )
    except Exception as e:
        # Fallback to root password if empty failed
        return pymysql.connect(
            host=host, port=port, user=user, password='root',
            database=database, autocommit=True, charset='utf8mb4'
        )

def column_exists(cur, table, column):
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.columns "
        "WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s",
        (table, column)
    )
    return cur.fetchone()[0] > 0

def add_column_if_missing(cur, table, column, definition):
    if not column_exists(cur, table, column):
        print(f"  + Adding {table}.{column}...")
        cur.execute(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")
    else:
        print(f"  [OK] {table}.{column} exists")

def main():
    conn = get_connection()
    cur = conn.cursor()
    print("Connected to MySQL kuwy_helpdesk database.")

    # 1. Update `companies` table columns
    print("\n--- 1. Updating `companies` columns ---")
    company_cols = [
        ("settings_json", "LONGTEXT DEFAULT NULL"),
        ("support_email", "VARCHAR(255) DEFAULT NULL"),
        ("support_phone", "VARCHAR(100) DEFAULT NULL"),
        ("support_address", "VARCHAR(300) DEFAULT NULL"),
        ("legal_name", "VARCHAR(255) DEFAULT NULL"),
        ("business_hours_text", "VARCHAR(255) DEFAULT 'Mon - Fri, 9:00 AM - 6:00 PM IST'"),
        ("portal_name", "VARCHAR(255) DEFAULT NULL"),
        ("portal_welcome_message", "TEXT DEFAULT NULL"),
        ("accent_color", "VARCHAR(30) DEFAULT '#6366f1'"),
        ("powered_by_badge", "BOOLEAN DEFAULT TRUE"),
        ("custom_domain_status", "VARCHAR(40) DEFAULT 'ACTIVE'"),
    ]
    for col, defn in company_cols:
        add_column_if_missing(cur, "companies", col, defn)

    # 2. Update `users` table columns
    print("\n--- 2. Updating `users` columns ---")
    user_cols = [
        ("status", "VARCHAR(20) DEFAULT 'ACTIVE'"),
        ("is_two_factor_enabled", "BOOLEAN DEFAULT FALSE"),
        ("two_factor_secret", "VARCHAR(64) DEFAULT NULL"),
        ("backup_codes", "TEXT DEFAULT NULL"),
        ("failed_login_attempts", "INT DEFAULT 0"),
        ("lockout_until", "TIMESTAMP NULL DEFAULT NULL"),
    ]
    for col, defn in user_cols:
        add_column_if_missing(cur, "users", col, defn)

    # 3. Update `company_mailboxes` columns
    print("\n--- 3. Updating `company_mailboxes` columns ---")
    add_column_if_missing(cur, "company_mailboxes", "forwarding_address", "VARCHAR(255) DEFAULT NULL")
    add_column_if_missing(cur, "company_mailboxes", "forwarding_verified", "BOOLEAN NOT NULL DEFAULT FALSE")

    try:
        cur.execute("""
            ALTER TABLE `company_mailboxes` 
            MODIFY COLUMN `provider_type` ENUM('MICROSOFT_365', 'EXCHANGE_ONLINE', 'GOOGLE_WORKSPACE', 'IMAP_SMTP', 'FORWARDING') NOT NULL DEFAULT 'MICROSOFT_365',
            MODIFY COLUMN `auth_type` ENUM('OAUTH2_GRAPH_API', 'OAUTH2_IMAP', 'BASIC_AUTH', 'FORWARD_ONLY') NOT NULL DEFAULT 'OAUTH2_GRAPH_API'
        """)
        print("  [OK] `company_mailboxes` enum definitions updated")
    except Exception as e:
        print("  ! Notice updating company_mailboxes enums:", e)

    # 4. Update `ticket_attachments` column
    print("\n--- 4. Updating `ticket_attachments` ---")
    try:
        cur.execute("""
            ALTER TABLE `ticket_attachments`
            MODIFY COLUMN `storage_type` ENUM('LOCAL_DISK', 'S3', 'AZURE_BLOB', 'CLOUDINARY') NOT NULL DEFAULT 'LOCAL_DISK'
        """)
        print("  [OK] `ticket_attachments.storage_type` updated to include CLOUDINARY")
    except Exception as e:
        print("  ! Notice updating ticket_attachments:", e)

    # 5. Create new tables
    print("\n--- 5. Creating New Database Tables ---")

    tables_sql = {
        "password_reset_tokens": """
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
        """,
        "agent_invitations": """
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
        """,
        "security_audit_logs": """
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
        """,
        "company_subscriptions": """
            CREATE TABLE IF NOT EXISTS `company_subscriptions` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `company_id` BIGINT NOT NULL,
                `plan_tier` ENUM('FREE', 'STARTER', 'PRO', 'ENTERPRISE') NOT NULL DEFAULT 'STARTER',
                `billing_cycle` ENUM('MONTHLY', 'ANNUAL') NOT NULL DEFAULT 'MONTHLY',
                `amount` DECIMAL(10,2) NOT NULL DEFAULT 2999.00,
                `currency` VARCHAR(10) NOT NULL DEFAULT 'INR',
                `gateway_provider` VARCHAR(50) DEFAULT 'RAZORPAY',
                `gateway_subscription_id` VARCHAR(100) DEFAULT NULL,
                `agent_limit` INT NOT NULL DEFAULT 5,
                `ticket_limit_monthly` INT NOT NULL DEFAULT 1000,
                `status` ENUM('ACTIVE', 'TRIAL', 'PAST_DUE', 'CANCELLED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
                `current_period_start` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `current_period_end` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `grace_period_ends_at` TIMESTAMP NULL DEFAULT NULL,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
                INDEX `idx_sub_company` (`company_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        "canned_responses": """
            CREATE TABLE IF NOT EXISTS `canned_responses` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `company_id` BIGINT NOT NULL,
                `department_id` BIGINT DEFAULT NULL,
                `title` VARCHAR(150) NOT NULL,
                `shortcut` VARCHAR(50) NOT NULL,
                `content` TEXT NOT NULL,
                `is_shared` BOOLEAN NOT NULL DEFAULT TRUE,
                `created_by_user_id` BIGINT DEFAULT NULL,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
                INDEX `idx_canned_company` (`company_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        "automation_rules": """
            CREATE TABLE IF NOT EXISTS `automation_rules` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `company_id` BIGINT NOT NULL,
                `name` VARCHAR(150) NOT NULL,
                `event_trigger` ENUM('TICKET_CREATED', 'TICKET_UPDATED', 'CUSTOMER_REPLIED', 'SLA_BREACHED', 'TIME_INACTIVE') NOT NULL,
                `condition_json` JSON DEFAULT NULL,
                `action_json` JSON DEFAULT NULL,
                `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
                `priority_order` INT NOT NULL DEFAULT 10,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
                INDEX `idx_auto_company` (`company_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        "email_templates": """
            CREATE TABLE IF NOT EXISTS `email_templates` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `company_id` BIGINT NOT NULL,
                `template_type` ENUM('TICKET_CREATED_CONFIRMATION', 'AGENT_REPLY', 'TICKET_RESOLVED', 'TICKET_CLOSED', 'CUSTOMER_OTP') NOT NULL,
                `subject_template` VARCHAR(255) NOT NULL,
                `body_html` TEXT NOT NULL,
                `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
                INDEX `idx_tpl_company` (`company_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        "customer_auth_tokens": """
            CREATE TABLE IF NOT EXISTS `customer_auth_tokens` (
                `id` BIGINT AUTO_INCREMENT PRIMARY KEY,
                `company_id` BIGINT NOT NULL,
                `email` VARCHAR(255) NOT NULL,
                `otp_code` VARCHAR(10) NOT NULL,
                `token` VARCHAR(255) NOT NULL,
                `expires_at` TIMESTAMP NOT NULL,
                `is_used` BOOLEAN NOT NULL DEFAULT FALSE,
                `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
                INDEX `idx_auth_token` (`token`),
                INDEX `idx_auth_email` (`company_id`, `email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
    }

    for tname, sql in tables_sql.items():
        cur.execute(sql)
        print(f"  [OK] Table `{tname}` verified/created.")

    # 6. Seed Subscriptions for default companies if missing
    print("\n--- 6. Seeding Default Data ---")
    cur.execute("SELECT id, name FROM companies")
    comps = cur.fetchall()
    for cid, cname in comps:
        cur.execute("SELECT COUNT(*) FROM company_subscriptions WHERE company_id = %s", (cid,))
        if cur.fetchone()[0] == 0:
            cur.execute("""
                INSERT INTO company_subscriptions (company_id, plan_tier, billing_cycle, amount, agent_limit, ticket_limit_monthly, status)
                VALUES (%s, 'ENTERPRISE', 'ANNUAL', 29999.00, 50, 50000, 'ACTIVE')
            """, (cid,))
            print(f"  + Seeded ENTERPRISE subscription for '{cname}' (id: {cid})")

        # Seed canned responses if empty
        cur.execute("SELECT COUNT(*) FROM canned_responses WHERE company_id = %s", (cid,))
        if cur.fetchone()[0] == 0:
            canned_items = [
                ("Greeting & Acknowledgement", "/hi", "<p>Hello {{contact.name}},</p><p>Thank you for reaching out to Kuwy Support. We have received your request and our engineering team is reviewing it.</p><p>Best regards,<br/>Kuwy Support Team</p>"),
                ("Request KYC Documents", "/kyc", "<p>Dear {{contact.name}},</p><p>To expedite your verification, please upload your Aadhaar Card and PAN Card copy by replying to this ticket.</p>"),
                ("Issue Resolved Confirmation", "/resolved", "<p>Hello {{contact.name}},</p><p>We are pleased to inform you that your reported issue has been successfully resolved. Please let us know if you require any further assistance.</p>")
            ]
            for title, shortcut, content in canned_items:
                cur.execute("""
                    INSERT INTO canned_responses (company_id, title, shortcut, content, is_shared)
                    VALUES (%s, %s, %s, %s, TRUE)
                """, (cid, title, shortcut, content))
            print(f"  + Seeded canned responses for '{cname}' (id: {cid})")

        # Seed email templates if empty
        cur.execute("SELECT COUNT(*) FROM email_templates WHERE company_id = %s", (cid,))
        if cur.fetchone()[0] == 0:
            tpl_items = [
                ("TICKET_CREATED_CONFIRMATION", "[{{ticket.number}}] Support Request Received: {{ticket.subject}}", "<h3>Support Request Received</h3><p>Dear {{contact.name}},</p><p>Your ticket #{{ticket.number}} has been created. A support engineer has been notified.</p>"),
                ("AGENT_REPLY", "Re: [{{ticket.number}}] {{ticket.subject}}", "<div>{{reply.body_html}}</div><hr/><p style='color:#666;'>Reply to this email directly to update your ticket.</p>"),
                ("TICKET_RESOLVED", "[{{ticket.number}}] Ticket Resolved: {{ticket.subject}}", "<p>Dear {{contact.name}},</p><p>Ticket #{{ticket.number}} has been marked as resolved. If you still have questions, simply reply to reopen.</p>")
            ]
            for ttype, subj, body in tpl_items:
                cur.execute("""
                    INSERT INTO email_templates (company_id, template_type, subject_template, body_html, is_active)
                    VALUES (%s, %s, %s, %s, TRUE)
                """, (cid, ttype, subj, body))
            print(f"  + Seeded email templates for '{cname}' (id: {cid})")

    # 7. Summary
    cur.execute("SHOW TABLES")
    all_tables = cur.fetchall()
    print(f"\n=======================================================")
    print(f"SUCCESS: Database migrations complete. Total tables: {len(all_tables)}")
    print(f"=======================================================\n")

if __name__ == '__main__':
    main()
