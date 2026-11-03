#!/usr/bin/env python3
"""
Kuwy HelpDesk - Database Initializer and Migration Runner
Executes schema.sql and seed-data.sql against MySQL and verifies the created tables.
"""

import os
import sys
import argparse
import pymysql

def parse_sql_statements(file_path):
    """Read an SQL file and split into individual executable statements."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    statements = []
    current_stmt = []
    in_delimiter = False

    for line in content.splitlines():
        trimmed = line.strip()
        # Skip pure comment lines
        if trimmed.startswith('--') or trimmed.startswith('/*') or not trimmed:
            continue
        current_stmt.append(line)
        if trimmed.endswith(';'):
            statements.append('\n'.join(current_stmt))
            current_stmt = []

    if current_stmt:
        remaining = '\n'.join(current_stmt).strip()
        if remaining:
            statements.append(remaining)

    return statements

def run_migration(host, port, user, password, schema_file, seed_file=None):
    print(f"\n=======================================================")
    print(f" Kuwy HelpDesk: MySQL Multi-Tenant Setup")
    print(f" Connecting to: {host}:{port} as user '{user}'")
    print(f"=======================================================")

    try:
        # Step 1: Connect to server without database
        conn = pymysql.connect(
            host=host,
            port=int(port),
            user=user,
            password=password,
            charset='utf8mb4',
            autocommit=True
        )
        print(" [OK] Successfully connected to MySQL server!")
    except Exception as e:
        print(f"\n [ERROR] Failed to connect to MySQL: {e}")
        print("\nTroubleshooting:")
        print("1. Is MySQL Server installed and running?")
        print("2. Check the host, port, user, and password.")
        print(f"   Run: python database/init_db.py --host {host} --port {port} --user {user} --password YOUR_PASSWORD")
        return False

    cursor = conn.cursor()

    try:
        # Step 2: Run schema DDL
        print(f"\n Executing Schema DDL: {schema_file}")
        schema_stmts = parse_sql_statements(schema_file)
        for i, stmt in enumerate(schema_stmts, 1):
            cursor.execute(stmt)
        print(f" [OK] Successfully executed {len(schema_stmts)} schema statements.")

        # Reconnect to kuwy_helpdesk database explicitly
        conn.select_db('kuwy_helpdesk')

        # Step 3: Run Seed Data (if provided)
        if seed_file and os.path.exists(seed_file):
            print(f"\n Seeding Initial Multi-Company & Microsoft 365 Data: {seed_file}")
            seed_stmts = parse_sql_statements(seed_file)
            for stmt in seed_stmts:
                cursor.execute(stmt)
            print(f" [OK] Successfully executed {len(seed_stmts)} seed data statements.")

        # Step 4: Verification and Summary
        print(f"\n=======================================================")
        print(f" Database Verification: kuwy_helpdesk")
        print(f"=======================================================")
        cursor.execute("SHOW TABLES;")
        tables = [row[0] for row in cursor.fetchall()]
        print(f" Total Tables Created: {len(tables)}\n")

        table_counts = [
            'companies', 'departments', 'roles', 'permissions', 'users',
            'customer_accounts', 'contacts', 'company_mailboxes',
            'sla_policies', 'tickets', 'ticket_threads', 'tags', 'kb_articles'
        ]

        print(f" {'Table Name':<25} | {'Row Count':<10}")
        print(f" {'-'*25}-+-{'-'*10}")
        for tbl in tables:
            cursor.execute(f"SELECT COUNT(*) FROM `{tbl}`;")
            count = cursor.fetchone()[0]
            print(f" {tbl:<25} | {count:<10}")

        print(f"\n [SUCCESS] Kuwy HelpDesk Database and Tables are ready!")
        return True

    except Exception as e:
        print(f"\n [ERROR] Failed during SQL execution: {e}")
        return False
    finally:
        cursor.close()
        conn.close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Initialize Kuwy HelpDesk MySQL Database")
    parser.add_argument('--host', default=os.getenv('MYSQL_HOST', 'localhost'), help="MySQL Host (default: localhost)")
    parser.add_argument('--port', default=os.getenv('MYSQL_PORT', '3306'), help="MySQL Port (default: 3306)")
    parser.add_argument('--user', default=os.getenv('MYSQL_USER', 'root'), help="MySQL User (default: root)")
    parser.add_argument('--password', default=os.getenv('MYSQL_PASSWORD', 'root'), help="MySQL Password (default: root)")
    parser.add_argument('--skip-seed', action='store_true', help="Do not insert sample seed data")

    args = parser.parse_args()

    base_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(base_dir, 'schema.sql')
    seed_path = None if args.skip_seed else os.path.join(base_dir, 'seed-data.sql')

    success = run_migration(
        host=args.host,
        port=args.port,
        user=args.user,
        password=args.password,
        schema_file=schema_path,
        seed_file=seed_path
    )

    sys.exit(0 if success else 1)
