import os
import pymysql

conn = pymysql.connect(
    host='localhost',
    user='root',
    password=os.getenv('MYSQL_PASSWORD', 'root'),
    database='kuwy_helpdesk',
    charset='utf8mb4',
    autocommit=True
)

cursor = conn.cursor()

# 1. Insert new departments/categories if they don't exist
departments = [
    # Company 1 (Kuwy)
    (1, 'Finance, Accounts & Invoicing', 'FINANCE', 'Invoicing, payouts, dealer commissions, and taxation'),
    (1, 'Human Resources & People Ops', 'HR', 'Employee onboarding, internal IT requests, and benefits'),
    (1, 'Legal & Regulatory Compliance', 'LEGAL', 'RBI compliance, KYC verification, legal escalations'),
    # Company 2 (Acme)
    (2, 'Customs & Financial Accounts', 'FINANCE', 'Freight billing, customs tariffs, vendor payouts'),
    (2, 'Logistics IT & Tracking Systems', 'IT', 'Telematics, tracking GPS, and ERP connectivity'),
    (2, 'Driver Relations & HR Desk', 'HR', 'Driver onboarding, route permits, and payroll')
]

for comp_id, name, code, desc in departments:
    cursor.execute("""
        SELECT id FROM departments WHERE company_id = %s AND code = %s
    """, (comp_id, code))
    row = cursor.fetchone()
    if not row:
        cursor.execute("""
            INSERT INTO departments (company_id, name, code, description, is_active)
            VALUES (%s, %s, %s, %s, TRUE)
        """, (comp_id, name, code, desc))
        print(f"Added department {name} ({code}) for company {comp_id}")
    else:
        print(f"Department {code} already exists for company {comp_id} (ID: {row[0]})")

# Map department codes to IDs for Company 1
cursor.execute("SELECT code, id FROM departments WHERE company_id = 1")
kuwy_depts = dict(cursor.fetchall())
print("Kuwy Departments:", kuwy_depts)

# 2. Insert Technical Support Engineers for Kuwy (Company 1)
# Password hash for Password@123
pwd_hash = '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm'

engineers = [
    ('test.it@kuwy.in', 'Sanjay', 'Verma', 'Sanjay Verma (IT Support Engineer)', '+91 9876543220', kuwy_depts.get('IT'), 3),
    ('test.finance@kuwy.in', 'Meenakshi', 'Sundaram', 'Meenakshi S (Finance Support Engineer)', '+91 9876543221', kuwy_depts.get('FINANCE'), 3),
    ('test.operations@kuwy.in', 'Rajesh', 'Kumar', 'Rajesh K (Operations Support Lead)', '+91 9876543222', kuwy_depts.get('OPS'), 3),
    ('test.hr@kuwy.in', 'Ananya', 'Rao', 'Ananya Rao (HR Support Specialist)', '+91 9876543223', kuwy_depts.get('HR'), 3),
    ('test.legal@kuwy.in', 'Venkatesh', 'Iyer', 'Venkatesh Iyer (Legal & Compliance)', '+91 9876543224', kuwy_depts.get('LEGAL'), 3),
]

for email, first, last, disp, phone, dept_id, role_id in engineers:
    cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
    row = cursor.fetchone()
    if not row:
        cursor.execute("""
            INSERT INTO users (company_id, email, password_hash, first_name, last_name, display_name, phone, role_id, primary_department_id, is_active, is_verified)
            VALUES (1, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
        """, (email, pwd_hash, first, last, disp, phone, role_id, dept_id))
        user_id = cursor.lastrowid
        if dept_id:
            cursor.execute("INSERT INTO user_departments (user_id, department_id) VALUES (%s, %s)", (user_id, dept_id))
        print(f"Created Technical Support Engineer: {disp} ({email}) in dept ID {dept_id}")
    else:
        cursor.execute("UPDATE users SET primary_department_id = %s WHERE id = %s", (dept_id, row[0]))
        print(f"User {email} already exists (ID: {row[0]}), updated dept ID to {dept_id}")

# 3. Add sample realistic tickets across IT, Finance, Operations, HR to have rich tracking data
tickets_to_add = [
    (1, kuwy_depts.get('IT'), 1, 1, 'API Timeout on LMS Partner Gateway during peak disbursement', 'HIGH', 'OPEN', 'MICROSOFT_365', 'Gateway returned HTTP 504 during batch disbursement request #49912.'),
    (1, kuwy_depts.get('FINANCE'), 1, 2, 'Dealer Commission Reconciliation mismatch for October cycle', 'MEDIUM', 'IN_PROGRESS', 'WEB_PORTAL', 'Variance of INR 45,200 detected in Sri Vari Auto commission ledger.'),
    (1, kuwy_depts.get('HR'), 1, 3, 'New Support Engineer Laptop & VPN credential provisioning', 'MEDIUM', 'RESOLVED', 'WEB_PORTAL', 'Hardware configured, Fortinet VPN profile generated and sent to employee.'),
    (1, kuwy_depts.get('LEGAL'), 2, 4, 'Annual CIBIL Data Reporting Audit Verification & Signoff', 'LOW', 'CLOSED', 'WEB_PORTAL', 'Compliance signoff completed for Q3 regulatory submission.'),
    (1, kuwy_depts.get('OPS'), 1, 1, 'Urgent: RC Transfer Delay escalation from Chennai dealership', 'URGENT', 'OPEN', 'MICROSOFT_365', 'Customer vehicle registration document held up at RTO. Immediate verification requested.')
]

# Get max ticket ID
cursor.execute("SELECT COALESCE(MAX(id), 0) FROM tickets")
max_id = cursor.fetchone()[0]

for idx, (comp_id, dept_id, contact_id, agent_offset, subject, priority, status, channel, desc) in enumerate(tickets_to_add, start=1):
    t_num = f"KUWY-{1003 + idx}"
    cursor.execute("SELECT id FROM tickets WHERE ticket_number = %s", (t_num,))
    if not cursor.fetchone():
        cursor.execute("""
            INSERT INTO tickets (
                company_id, ticket_number, department_id, contact_id, channel, subject,
                description_text, description_html, status, priority,
                first_response_due_at, resolution_due_at, sla_status
            )
            VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                DATE_ADD(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 24 HOUR), 'WITHIN_SLA'
            )
        """, (
            comp_id, t_num, dept_id, contact_id, channel, subject,
            desc, f"<p>{desc}</p>", status, priority
        ))
        print(f"Created sample ticket {t_num} ({subject[:35]}...) in dept ID {dept_id}")

conn.close()
print("Seed script completed successfully.")
