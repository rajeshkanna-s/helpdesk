import pymysql

conn = pymysql.connect(host='localhost', port=3306, user='root', password='', database='kuwy_helpdesk')
cur = conn.cursor()

cur.execute("SELECT id FROM users WHERE email = 'testsuperadmin@kuwy.in'")
if not cur.fetchone():
    cur.execute("""
        INSERT INTO users (company_id, email, password_hash, first_name, last_name, display_name, phone, role_id, primary_department_id, is_active)
        VALUES (1, 'testsuperadmin@kuwy.in', '$2a$10$wT8KzWvVv3f0K9O7h51vCeK2rR1nZ0rFw6lA5M0mS5T2b9v8e7lGm', 'Platform', 'Owner', 'Platform Owner (Super Admin)', '+91 9999900000', 1, 2, TRUE)
    """)
    conn.commit()
    print('Super Admin user created successfully!')
else:
    print('Super Admin user already exists.')

cur.execute('SELECT u.id, u.email, u.display_name, r.role_type FROM users u JOIN roles r ON r.id = u.role_id')
for row in cur.fetchall():
    print(row)

cur.close()
conn.close()
