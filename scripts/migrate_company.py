"""CREATE employees + reminders in Neon prod (idempotent)."""
import os
import psycopg
from dotenv import load_dotenv

load_dotenv(".env.prod")

DDL = """
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    entity_id INTEGER NOT NULL REFERENCES entities(id),
    name TEXT NOT NULL,
    role TEXT,
    email TEXT,
    phone TEXT,
    contract_type TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    monthly_salary NUMERIC(14,2) NOT NULL DEFAULT 0,
    payment_day INTEGER,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_entity_id ON employees(entity_id);

CREATE TABLE IF NOT EXISTS reminders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    entity_id INTEGER REFERENCES entities(id),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    due_at TIMESTAMPTZ NOT NULL,
    repeat_rule TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING',
    notify_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_entity_id ON reminders(entity_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
"""


def main():
    url = os.environ["DATABASE_URL_UNPOOLED"]
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
        with conn.cursor() as cur:
            for t in ("employees", "reminders"):
                cur.execute(f"SELECT COUNT(*) FROM {t}")
                print(f"OK: {t} ({cur.fetchone()[0]} rows)")


if __name__ == "__main__":
    main()
