"""CREATE properties + vehicles in Neon prod (idempotent)."""
import os
import sys

import psycopg
from dotenv import load_dotenv

load_dotenv(".env.prod")

DDL = """
CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    liability_id INTEGER REFERENCES liabilities(id),
    name TEXT NOT NULL,
    property_type TEXT NOT NULL DEFAULT 'RESIDENCE',
    address TEXT,
    city TEXT,
    country TEXT,
    area_m2 NUMERIC(10,2),
    purchase_date DATE,
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_value NUMERIC(14,2),
    monthly_rental_income NUMERIC(12,2) NOT NULL DEFAULT 0,
    monthly_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_user_id ON properties(user_id);
CREATE INDEX IF NOT EXISTS idx_properties_liability_id ON properties(liability_id);

CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    liability_id INTEGER REFERENCES liabilities(id),
    name TEXT NOT NULL,
    vehicle_type TEXT NOT NULL DEFAULT 'CAR',
    make TEXT,
    model TEXT,
    year INTEGER,
    license_plate TEXT,
    purchase_date DATE,
    purchase_price NUMERIC(14,2) NOT NULL DEFAULT 0,
    current_value NUMERIC(14,2),
    monthly_income NUMERIC(12,2) NOT NULL DEFAULT 0,
    monthly_expenses NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_liability_id ON vehicles(liability_id);
"""


def main():
    url = os.environ["DATABASE_URL_UNPOOLED"]
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
        with conn.cursor() as cur:
            cur.execute(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name IN ('properties','vehicles') "
                "ORDER BY table_name"
            )
            for r in cur.fetchall():
                print(f"OK: table {r[0]} exists")
            cur.execute("SELECT COUNT(*) FROM properties")
            print(f"properties rows: {cur.fetchone()[0]}")
            cur.execute("SELECT COUNT(*) FROM vehicles")
            print(f"vehicles rows: {cur.fetchone()[0]}")


if __name__ == "__main__":
    main()
