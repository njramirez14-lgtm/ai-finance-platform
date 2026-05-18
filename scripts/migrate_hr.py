"""CREATE employee_documents + employee_leaves in Neon prod (idempotent)."""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv(".env.prod")

DDL = """
CREATE TABLE IF NOT EXISTS employee_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    doc_type TEXT NOT NULL DEFAULT 'OTHER',
    file_url TEXT,
    drive_file_id TEXT,
    provider TEXT,
    issued_date DATE,
    expires_at DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_empdocs_user_id ON employee_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_empdocs_employee_id ON employee_documents(employee_id);

CREATE TABLE IF NOT EXISTS employee_leaves (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type TEXT NOT NULL DEFAULT 'SICK',
    start_date DATE NOT NULL,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'APPROVED',
    document_id INTEGER REFERENCES employee_documents(id),
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leaves_user_id ON employee_leaves(user_id);
CREATE INDEX IF NOT EXISTS idx_leaves_employee_id ON employee_leaves(employee_id);
CREATE INDEX IF NOT EXISTS idx_leaves_start_date ON employee_leaves(start_date);
"""


def main():
    with psycopg.connect(os.environ["DATABASE_URL_UNPOOLED"]) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
        with conn.cursor() as cur:
            for t in ("employee_documents", "employee_leaves"):
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                print(f"OK: {t} ({cur.fetchone()[0]} rows)")


if __name__ == "__main__":
    main()
