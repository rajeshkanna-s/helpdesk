-- ========================================================================
-- SEED DATA: Realistic Multi-Company & Microsoft 365 Mailbox Dataset
-- ========================================================================

USE `kuwy_helpdesk`;

-- Disable checks during bulk seed
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------
-- 1. COMPANIES (Tenants)
-- ------------------------------------------------------------------------
INSERT INTO `companies` (`id`, `company_code`, `name`, `subdomain`, `custom_domain`, `logo_url`, `primary_color`, `timezone`, `status`, `plan_name`)
VALUES
(1, 'KUWY', 'Kuwy Technology Services Pvt Ltd', 'kuwy', 'helpdesk.kuwy.in', 'https://kuwy.in/assets/logo.png', '#0d6efd', 'Asia/Kolkata', 'ACTIVE', 'ENTERPRISE'),
(2, 'ACME', 'Acme Global Logistics', 'acme', 'support.acmelogistics.com', 'https://acme.com/logo.png', '#198754', 'Asia/Kolkata', 'ACTIVE', 'PROFESSIONAL');

-- ------------------------------------------------------------------------
-- 2. DEPARTMENTS
-- ------------------------------------------------------------------------
INSERT INTO `departments` (`id`, `company_id`, `name`, `code`, `description`)
VALUES
(1, 1, 'Loan Origination & Ops', 'OPS', 'Loan verification, document processing, and credit approvals'),
(2, 1, 'IT & Engineering Support', 'IT', 'API integrations, partner LMS queries, and technical incidents'),
(3, 1, 'Merchant & Dealer Helpdesk', 'MERCHANT', 'Auto dealership onboarding, POS terminal, and commission settlements'),
(4, 2, 'Fleet & Freight Support', 'FLEET', 'Truck dispatch, customs clearance, and delivery tracking');

-- ------------------------------------------------------------------------
-- 3. ROLES & PERMISSIONS
-- ------------------------------------------------------------------------
INSERT INTO `roles` (`id`, `company_id`, `name`, `role_type`, `description`, `is_system_role`)
VALUES
(1, NULL, 'Super Administrator', 'SUPER_ADMIN', 'Global system administrator across all companies', TRUE),
(2, 1, 'Kuwy Helpdesk Admin', 'COMPANY_ADMIN', 'Full control over Kuwy company configuration and agents', TRUE),
(3, 1, 'Senior Support Engineer', 'AGENT', 'Ticket resolution, customer communication, and internal notes', TRUE),
(4, 2, 'Acme Support Admin', 'COMPANY_ADMIN', 'Acme company administrator', TRUE);

INSERT INTO `permissions` (`id`, `permission_key`, `category`, `description`)
VALUES
(1, 'ticket:view', 'TICKETS', 'View tickets assigned or in department'),
(2, 'ticket:create', 'TICKETS', 'Create new tickets manually'),
(3, 'ticket:reply', 'TICKETS', 'Send public replies to customers'),
(4, 'ticket:internal_note', 'TICKETS', 'Add private agent notes'),
(5, 'ticket:assign', 'TICKETS', 'Assign or reassign tickets'),
(6, 'mailbox:configure', 'CHANNELS', 'Connect and manage Microsoft 365 mailboxes'),
(7, 'company:manage', 'SETTINGS', 'Manage company profile, departments, and branding');

INSERT INTO `role_permissions` (`role_id`, `permission_id`)
VALUES
(2, 1), (2, 2), (2, 3), (2, 4), (2, 5), (2, 6), (2, 7),
(3, 1), (3, 2), (3, 3), (3, 4), (3, 5);

-- ------------------------------------------------------------------------
-- 4. USERS (Support Agents / Admins)
-- Password for all sample users: Password@123 (BCrypt hash)
-- ------------------------------------------------------------------------
INSERT INTO `users` (`id`, `company_id`, `email`, `password_hash`, `first_name`, `last_name`, `display_name`, `phone`, `role_id`, `primary_department_id`, `is_active`)
VALUES
(1, 1, 'testadmin@kuwy.in', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'Seetha', 'Raman', 'Seetha Raman (Admin)', '+91 9876543210', 2, 2, TRUE),
(2, 1, 'testkarthik.agent@kuwy.in', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'Karthik', 'Narayanan', 'Karthik N (Support)', '+91 9876543211', 3, 2, TRUE),
(3, 1, 'testdivya.ops@kuwy.in', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'Divya', 'Priya', 'Divya P (Operations)', '+91 9876543212', 3, 1, TRUE),
(4, 2, 'testsupport@acme.com', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'John', 'Doe', 'John Doe (Acme Lead)', '+1 555-0199', 4, 4, TRUE),
(5, 1, 'testsuperadmin@kuwy.in', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'Platform', 'Owner', 'Platform Owner (Super Admin)', '+91 9999900000', 1, 2, TRUE);

INSERT INTO `user_departments` (`user_id`, `department_id`)
VALUES
(1, 1), (1, 2), (1, 3),
(2, 2),
(3, 1);

-- ------------------------------------------------------------------------
-- 5. CUSTOMER ACCOUNTS & CONTACTS
-- ------------------------------------------------------------------------
INSERT INTO `customer_accounts` (`id`, `company_id`, `account_name`, `website`, `phone`, `industry`)
VALUES
(1, 1, 'Sri Vari Auto Dealers Ltd', 'https://srivariauto.com', '+91 44 2828 0001', 'Automotive Dealership'),
(2, 1, 'Chola Mandalam Finance Hub', 'https://cholafinance.com', '+91 44 2828 0002', 'Non-Banking Financial Co (NBFC)');

INSERT INTO `contacts` (`id`, `company_id`, `account_id`, `first_name`, `last_name`, `email`, `phone`, `is_portal_user`)
VALUES
(1, 1, 1, 'Rajesh', 'Sundaram', 'testrajesh.sundaram@srivariauto.com', '+91 9840112233', TRUE),
(2, 1, 2, 'Pooja', 'Menon', 'testpooja.menon@cholafinance.com', '+91 9840223344', TRUE),
(3, 2, NULL, 'Mark', 'Spencer', 'testmark@freightline.org', '+1 555-0144', TRUE);

-- ------------------------------------------------------------------------
-- 6. MICROSOFT 365 MAILBOX CONFIGURATION
-- ------------------------------------------------------------------------
INSERT INTO `company_mailboxes` (
  `id`, `company_id`, `department_id`, `mailbox_name`, `email_address`,
  `provider_type`, `auth_type`, `ms_tenant_id`, `ms_client_id`,
  `ms_client_secret_enc`, `sync_status`, `send_as_name`, `reply_to_address`, `default_priority`
)
VALUES
(
  1, 1, 2, 'Kuwy IT & Partner Support', 'testsupport@kuwy.in',
  'MICROSOFT_365', 'OAUTH2_GRAPH_API',
  '9188040d-6c67-4c5b-b112-36a304b66dad', '412e8b91-8172-4d2b-9238-d63fa2118274',
  'enc_sample_secret_key_aes256', 'CONNECTED', 'Kuwy Support Desk', 'testsupport@kuwy.in', 'MEDIUM'
),
(
  2, 1, 1, 'Kuwy Loan Processing Mailbox', 'testloans@kuwy.in',
  'MICROSOFT_365', 'OAUTH2_GRAPH_API',
  '9188040d-6c67-4c5b-b112-36a304b66dad', '412e8b91-8172-4d2b-9238-d63fa2118274',
  'enc_sample_secret_key_aes256', 'CONNECTED', 'Kuwy Loan Operations', 'testloans@kuwy.in', 'HIGH'
);

-- ------------------------------------------------------------------------
-- 7. SLA POLICIES & BUSINESS HOURS
-- ------------------------------------------------------------------------
INSERT INTO `business_hours` (`id`, `company_id`, `name`, `timezone`, `schedule_json`, `is_default`)
VALUES
(1, 1, 'Kuwy Standard Business Hours', 'Asia/Kolkata', 
 '{"monday": {"start": "09:00", "end": "18:00"}, "tuesday": {"start": "09:00", "end": "18:00"}, "wednesday": {"start": "09:00", "end": "18:00"}, "thursday": {"start": "09:00", "end": "18:00"}, "friday": {"start": "09:00", "end": "18:00"}, "saturday": {"start": "09:00", "end": "14:00"}}', 
 TRUE);

INSERT INTO `sla_policies` (`id`, `company_id`, `name`, `description`, `business_hours_id`, `is_default`, `is_active`)
VALUES
(1, 1, 'Standard Enterprise SLA', 'Default turnaround times for Kuwy automotive partners', 1, TRUE, TRUE);

INSERT INTO `sla_targets` (`id`, `sla_policy_id`, `priority`, `first_response_time_minutes`, `resolution_time_minutes`, `escalate_after_minutes`)
VALUES
(1, 1, 'URGENT', 30, 240, 60),
(2, 1, 'HIGH', 60, 480, 120),
(3, 1, 'MEDIUM', 240, 1440, 480),
(4, 1, 'LOW', 480, 2880, 960);

-- ------------------------------------------------------------------------
-- 8. TICKETS
-- ------------------------------------------------------------------------
INSERT INTO `tickets` (
  `id`, `company_id`, `ticket_number`, `department_id`, `contact_id`, `assigned_agent_id`,
  `sla_policy_id`, `source_mailbox_id`, `channel`, `subject`, `description_html`, `description_text`,
  `status`, `priority`, `internet_message_id`, `ms_conversation_id`, `first_response_due_at`, `sla_status`
)
VALUES
(
  1, 1, 'KUWY-1001', 2, 1, 2,
  1, 1, 'MICROSOFT_365',
  'Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
  '<p>Hello Kuwy Team,</p><p>We are encountering a timeout error when trying to fetch the bureau score for loan application <b>#KW-98421</b>. Could you please check if the bureau integration is operational?</p><p>Regards,<br/>Rajesh Sundaram<br/>Sri Vari Auto</p>',
  'Hello Kuwy Team,\nWe are encountering a timeout error when trying to fetch the bureau score for loan application #KW-98421. Could you please check if the bureau integration is operational?\n\nRegards,\nRajesh Sundaram',
  'IN_PROGRESS', 'HIGH',
  '<CAKG7y8g9=XYZ1234@mail.outlook.com>', 'AAQkAGQxYTk4NTgzLWU2YjctNDAwNC05...',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR), 'WITHIN_SLA'
),
(
  2, 1, 'KUWY-1002', 1, 2, 3,
  1, 2, 'EMAIL',
  'Disbursement verification required for 3 sanctioned contracts',
  '<p>Hi Operations Team,</p><p>Attached are the signed loan sanction letters for dealer code D-402. Kindly initiate verification.</p>',
  'Hi Operations Team,\nAttached are the signed loan sanction letters for dealer code D-402. Kindly initiate verification.',
  'OPEN', 'MEDIUM',
  '<DM6PR14MB3201ABC@outlook.office365.com>', 'AAQkAGQxYTk4NTgzLWU2YjctNDAwNC01...',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 4 HOUR), 'WITHIN_SLA'
);

-- ------------------------------------------------------------------------
-- 9. TICKET THREADS / CONVERSATIONS (Email Ingestion & Replies)
-- ------------------------------------------------------------------------
INSERT INTO `ticket_threads` (
  `id`, `company_id`, `ticket_id`, `thread_type`, `sender_type`, `sender_contact_id`,
  `from_email`, `from_name`, `to_emails`, `subject`, `body_html`, `body_text`,
  `internet_message_id`, `is_private`
)
VALUES
(
  1, 1, 1, 'CUSTOMER_REPLY', 'CUSTOMER', 1,
  'testrajesh.sundaram@srivariauto.com', 'Rajesh Sundaram', 'testsupport@kuwy.in',
  'Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
  '<p>Hello Kuwy Team,</p><p>We are encountering a timeout error when trying to fetch the bureau score for loan application <b>#KW-98421</b>. Could you please check if the bureau integration is operational?</p>',
  'Hello Kuwy Team, We are encountering a timeout error when trying to fetch the bureau score for loan application #KW-98421.',
  '<CAKG7y8g9=XYZ1234@mail.outlook.com>', FALSE
),
(
  2, 1, 1, 'PRIVATE_NOTE', 'AGENT', NULL,
  'testkarthik.agent@kuwy.in', 'Karthik N (Support)', NULL,
  'Internal Investigation Note',
  '<p><b>@Seetha</b> I checked the bureau gateway logs. Experian and Equifax endpoints were momentarily slow between 14:10 and 14:25. Re-triggering the token now.</p>',
  '@Seetha I checked the bureau gateway logs. Experian and Equifax endpoints were momentarily slow. Re-triggering the token now.',
  NULL, TRUE
),
(
  3, 1, 1, 'REPLY', 'AGENT', NULL,
  'testsupport@kuwy.in', 'Karthik N | Kuwy Support', 'testrajesh.sundaram@srivariauto.com',
  'Re: [KUWY-1001] Dealer Portal: CIBIL Score Pull Failure for Application #KW-98421',
  '<p>Dear Rajesh,</p><p>Thank you for reaching out. We identified a transient network latency with the bureau service provider. We have re-polled the bureau report for Application <b>#KW-98421</b> and the score is now successfully updated in your portal.</p><p>Please review and let us know if you need anything else.</p><p>Best regards,<br/><b>Kuwy Technical Support</b></p>',
  'Dear Rajesh, We identified a transient network latency. We have re-polled the bureau report for Application #KW-98421 and the score is now successfully updated.',
  '<REPLY-KUWY-1001-01@kuwy.in>', FALSE
);

-- ------------------------------------------------------------------------
-- 10. TAGS
-- ------------------------------------------------------------------------
INSERT INTO `tags` (`id`, `company_id`, `name`, `color_hex`)
VALUES
(1, 1, 'Bureau-Issue', '#dc3545'),
(2, 1, 'Loan-Ops', '#0d6efd'),
(3, 1, 'Dealer-Portal', '#198754'),
(4, 1, 'Urgent-Disbursement', '#ffc107');

INSERT INTO `ticket_tags` (`ticket_id`, `tag_id`)
VALUES
(1, 1),
(1, 3),
(2, 2);

-- ------------------------------------------------------------------------
-- 11. AUDIT LOGS
-- ------------------------------------------------------------------------
INSERT INTO `ticket_audit_logs` (`id`, `company_id`, `ticket_id`, `actor_type`, `actor_id`, `actor_name`, `action`, `field_name`, `old_value`, `new_value`)
VALUES
(1, 1, 1, 'SYSTEM', NULL, 'Microsoft 365 Ingestion Engine', 'TICKET_CREATED', 'status', NULL, 'OPEN'),
(2, 1, 1, 'USER', 1, 'Seetha Raman', 'TICKET_ASSIGNED', 'assigned_agent_id', NULL, 'Karthik Narayanan'),
(3, 1, 1, 'USER', 2, 'Karthik Narayanan', 'STATUS_UPDATED', 'status', 'OPEN', 'IN_PROGRESS');

-- ------------------------------------------------------------------------
-- 12. KNOWLEDGE BASE
-- ------------------------------------------------------------------------
INSERT INTO `kb_categories` (`id`, `company_id`, `name`, `slug`, `description`, `icon`)
VALUES
(1, 1, 'Dealer Onboarding & Portal', 'dealer-portal', 'Guides on using Kuwy loan management and dealer tools', 'bi-speedometer2'),
(2, 1, 'Bureau & KYC Verification', 'bureau-kyc', 'Resolving CIBIL, Experian, and Aadhaar verification issues', 'bi-shield-check');

INSERT INTO `kb_articles` (`id`, `company_id`, `category_id`, `author_id`, `title`, `slug`, `content_html`, `status`, `view_count`, `helpful_votes`)
VALUES
(1, 1, 2, 1, 'How to handle Bureau Timeout errors in Kuwy Partner Portal', 'bureau-timeout-troubleshooting',
 '<h3>Troubleshooting Bureau Pull Errors</h3><p>When experiencing delays in credit score fetching:</p><ol><li>Verify that the applicant PAN number is valid.</li><li>Ensure mobile OTP for Aadhaar/Bureau consent is confirmed.</li><li>If the system times out, wait 2 minutes and click Retry Bureau Ingestion.</li></ol>',
 'PUBLISHED', 48, 12);

SET FOREIGN_KEY_CHECKS = 1;
