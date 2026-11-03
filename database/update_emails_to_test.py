import pymysql

def update_emails():
    conn = pymysql.connect(
        host='localhost',
        port=3306,
        user='root',
        password='',
        database='kuwy_helpdesk'
    )
    cur = conn.cursor()

    # 1. Update company_mailboxes
    cur.execute("UPDATE company_mailboxes SET email_address = 'testsupport@kuwy.in', reply_to_address = 'testsupport@kuwy.in' WHERE id = 1")
    cur.execute("UPDATE company_mailboxes SET email_address = 'testloans@kuwy.in', reply_to_address = 'testloans@kuwy.in' WHERE id = 2")
    cur.execute("UPDATE company_mailboxes SET email_address = CONCAT('test', email_address) WHERE email_address NOT LIKE 'test%'")

    # 2. Update users
    cur.execute("UPDATE users SET email = CONCAT('test', email) WHERE email NOT LIKE 'test%'")

    # 3. Update contacts
    cur.execute("UPDATE contacts SET email = CONCAT('test', email) WHERE email NOT LIKE 'test%'")

    # 4. Update ticket_threads
    cur.execute("UPDATE ticket_threads SET from_email = CONCAT('test', from_email) WHERE from_email NOT LIKE 'test%'")
    cur.execute("UPDATE ticket_threads SET to_emails = REPLACE(to_emails, 'support@kuwy.in', 'testsupport@kuwy.in') WHERE to_emails IS NOT NULL")
    cur.execute("UPDATE ticket_threads SET to_emails = REPLACE(to_emails, 'rajesh.sundaram@srivariauto.com', 'testrajesh.sundaram@srivariauto.com') WHERE to_emails IS NOT NULL")
    cur.execute("UPDATE ticket_threads SET to_emails = CONCAT('test', to_emails) WHERE to_emails IS NOT NULL AND to_emails NOT LIKE 'test%'")

    conn.commit()

    print("--- UPDATED COMPANY MAILBOXES ---")
    cur.execute("SELECT id, mailbox_name, email_address FROM company_mailboxes")
    for row in cur.fetchall():
        print(row)

    print("\n--- UPDATED USERS ---")
    cur.execute("SELECT id, email, display_name FROM users")
    for row in cur.fetchall():
        print(row)

    print("\n--- UPDATED CONTACTS ---")
    cur.execute("SELECT id, email, first_name FROM contacts")
    for row in cur.fetchall():
        print(row)

    print("\n--- UPDATED THREADS ---")
    cur.execute("SELECT id, from_email, to_emails FROM ticket_threads")
    for row in cur.fetchall():
        print(row)

    cur.close()
    conn.close()

if __name__ == '__main__':
    update_emails()
