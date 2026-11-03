# Kuwy HelpDesk — Multi-Tenant Ticketing Platform (Zoho Desk Alternative)

An enterprise multi-tenant customer support and ticketing platform built with:
- **Backend**: Java 21, Maven, Spring Boot 3.x, Spring Data JPA, Spring Security (JWT Multi-Tenant)
- **Frontend**: React 18+, TypeScript, Bootstrap 5, Modern CSS Design System
- **Database**: MySQL 8.0+ / MariaDB (Multi-Company Partitioning)
- **Email Ingestion**: Microsoft 365 / Exchange Online (Microsoft Graph API & OAuth 2.0 Webhooks)

---

## 1. Database Architecture & Table Structure

The database is organized into **14 core multi-tenant modules**:

| Module | Table Name | Description | Zoho Desk Equivalent |
|---|---|---|---|
| **Multi-Tenancy** | `companies` | Organizations/companies with isolated portals, subdomains, branding | Portals / Organizations |
| **Departments** | `departments` | Business units (e.g., IT Support, Loan Ops, Billing) | Departments |
| **RBAC** | `roles`, `permissions`, `role_permissions` | Granular agent and admin role permissions | Profiles & Roles |
| **Staff Users** | `users`, `user_departments` | Agents, Team Leads, and Admins | Agents |
| **Customers** | `customer_accounts`, `contacts` | End-users requesting support & client companies | Accounts & Contacts |
| **Email Channels** | `company_mailboxes` | Microsoft 365 OAuth credentials, Graph subscriptions, Sync state | Support Email Addresses |
| **SLA & Hours** | `business_hours`, `sla_policies`, `sla_targets` | Response & resolution timers with automated escalation | SLA & Business Hours |
| **Tickets** | `tickets` | Central ticket record with multi-tenant company isolation | Tickets |
| **Conversations** | `ticket_threads` | Ingested emails, agent replies, and private internal notes | Ticket Threads |
| **Attachments** | `ticket_attachments` | Files uploaded via web portal or parsed from email CID images | Attachments |
| **Tags & Fields** | `tags`, `ticket_tags`, `custom_field_definitions` | Dynamic labeling and custom metadata fields | Tags & Custom Fields |
| **Audit Log** | `ticket_audit_logs` | Tamper-evident audit trail of all ticket activities | Ticket History |
| **Notifications** | `notifications` | In-app alerts for ticket assignments and SLA breaches | Agent Notifications |
| **Knowledge Base**| `kb_categories`, `kb_articles` | Self-service help center articles per company | Help Center (KB) |

---

## 2. Setting Up Local MySQL Database

### Prerequisites
Make sure MySQL Server is running locally on port **3306**.
If you do not have MySQL installed yet, you can install it via:
```powershell
winget install Oracle.MySQL -e
# or using XAMPP / MariaDB / Docker
```

### Option A: Automated Provisioning via Python
Run the included migration runner (uses `pymysql`):
```bash
# With default root user and empty password:
python database/init_db.py

# With custom credentials:
python database/init_db.py --host localhost --port 3306 --user root --password YourPassword
```

### Option B: Automated Provisioning via PowerShell
```powershell
.\database\setup_database.ps1 -User root -Password "YourPassword"
```

### Option C: Direct MySQL Client Execution
```bash
mysql -u root -p < database/schema.sql
mysql -u root -p kuwy_helpdesk < database/seed-data.sql
```

---

## 3. How Microsoft 365 Email Ingestion Works (Backend Flow)

```
[Customer Emails testsupport@kuwy.in]
             │
             ▼
[Microsoft 365 / Exchange Online]
             │ (Webhook Change Notification or Delta Polling)
             ▼
[Spring Boot Graph Ingestion Service]
             │
             ├── 1. Matches Mailbox (`company_mailboxes.email_address`)
             │      -> Resolves `company_id` and default `department_id`
             │
             ├── 2. Thread Matching Engine:
             │      - Checks `In-Reply-To` & `References` header
             │      - Checks `ms_conversation_id`
             │      - Checks `[KUWY-XXXX]` ticket number regex in Subject
             │
             ├── 3. If Existing Ticket:
             │      -> Inserts new record into `ticket_threads` (type: CUSTOMER_REPLY)
             │      -> Updates `tickets.status` = 'OPEN'
             │
             └── 4. If New Email:
                    -> Creates or matches `contacts` record
                    -> Generates unique ticket number (`KUWY-1003`)
                    -> Calculates SLA targets (`first_response_due_at`, `resolution_due_at`)
                    -> Inserts into `tickets` & `ticket_threads`
                    -> Extracts attachments into `ticket_attachments`
```
