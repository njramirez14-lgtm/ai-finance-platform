"""Idempotent migrations applied on app startup.

We don't use Alembic for ad-hoc additions because Vercel serverless cold-starts
make running migrate-then-serve cycles awkward. Instead we keep small, narrow,
guard-railed ALTERs here and run them once per cold start. Each statement
checks the current schema first so it's safe to call repeatedly.
"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

log = logging.getLogger(__name__)


def _is_postgres(engine: Engine) -> bool:
    return engine.url.get_backend_name().startswith("postgres")


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    insp = inspect(engine)
    if table not in insp.get_table_names():
        return False
    return any(c["name"] == column for c in insp.get_columns(table))


def apply_transfer_support(engine: Engine) -> None:
    """Add TRANSFER enum value + linked_transaction_id + transfer_patterns."""
    is_pg = _is_postgres(engine)

    # 1. Add TRANSFER to the transactiontype enum (Postgres only — SQLite
    #    enums are validated app-side). ALTER TYPE ... ADD VALUE must run
    #    OUTSIDE a transaction block, so we open an AUTOCOMMIT connection.
    if is_pg:
        try:
            with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
                conn.execute(text(
                    "ALTER TYPE transactiontype ADD VALUE IF NOT EXISTS 'TRANSFER'"
                ))
        except Exception as exc:
            log.warning("Could not add TRANSFER enum value: %s", exc)

    with engine.begin() as conn:
        # 2. Add transactions.linked_transaction_id (self-FK)
        if not _column_exists(engine, "transactions", "linked_transaction_id"):
            if is_pg:
                conn.execute(text(
                    "ALTER TABLE transactions "
                    "ADD COLUMN IF NOT EXISTS linked_transaction_id INTEGER "
                    "REFERENCES transactions(id) ON DELETE SET NULL"
                ))
            else:
                conn.execute(text(
                    "ALTER TABLE transactions ADD COLUMN linked_transaction_id INTEGER"
                ))

        # 3. Add accounts.transfer_patterns
        if not _column_exists(engine, "accounts", "transfer_patterns"):
            if is_pg:
                conn.execute(text(
                    "ALTER TABLE accounts "
                    "ADD COLUMN IF NOT EXISTS transfer_patterns VARCHAR"
                ))
            else:
                conn.execute(text(
                    "ALTER TABLE accounts ADD COLUMN transfer_patterns VARCHAR"
                ))


def apply_subscription_kind(engine: Engine) -> None:
    """Add subscriptions.kind so the same table can store EXPENSE and INCOME
    recurring movements (salary, freelance fees, alquileres que cobras…)."""
    is_pg = _is_postgres(engine)
    if _column_exists(engine, "subscriptions", "kind"):
        return
    with engine.begin() as conn:
        if is_pg:
            conn.execute(text(
                "ALTER TABLE subscriptions "
                "ADD COLUMN IF NOT EXISTS kind VARCHAR NOT NULL DEFAULT 'EXPENSE'"
            ))
        else:
            conn.execute(text(
                "ALTER TABLE subscriptions "
                "ADD COLUMN kind VARCHAR NOT NULL DEFAULT 'EXPENSE'"
            ))


def apply_budgets_table(engine: Engine) -> None:
    """Create the budgets table on first cold start. Uses CREATE TABLE IF
    NOT EXISTS so re-running is safe; metadata.create_all wouldn't help
    here because the import-time table list may include the new model
    without create_all having been called yet on the prod DB."""
    is_pg = _is_postgres(engine)
    insp = inspect(engine)
    if "budgets" in insp.get_table_names():
        return
    with engine.begin() as conn:
        if is_pg:
            conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS budgets (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    category_id INTEGER REFERENCES categories(id),
                    month VARCHAR(7) NOT NULL,
                    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                    currency VARCHAR NOT NULL DEFAULT 'EUR',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    CONSTRAINT uq_budget_user_cat_month UNIQUE (user_id, category_id, month)
                )
                """
            ))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_budgets_user_id ON budgets(user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_budgets_month ON budgets(month)"))
        else:
            conn.execute(text(
                """
                CREATE TABLE IF NOT EXISTS budgets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    category_id INTEGER,
                    month VARCHAR(7) NOT NULL,
                    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
                    currency VARCHAR NOT NULL DEFAULT 'EUR',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, category_id, month)
                )
                """
            ))


def apply_notification_prefs(engine: Engine) -> None:
    """Add notification-preferences columns to the settings table."""
    is_pg = _is_postgres(engine)
    cols = [
        ("notify_email", "TEXT"),
        ("email_alerts_enabled", "BOOLEAN DEFAULT TRUE"),
        ("notify_reminders", "BOOLEAN DEFAULT TRUE"),
        ("notify_payroll", "BOOLEAN DEFAULT TRUE"),
        ("notify_documents", "BOOLEAN DEFAULT TRUE"),
        ("notify_investment_alerts", "BOOLEAN DEFAULT TRUE"),
    ]
    with engine.begin() as conn:
        for col, ddl in cols:
            if not _column_exists(engine, "settings", col):
                if is_pg:
                    conn.execute(text(f"ALTER TABLE settings ADD COLUMN {col} {ddl}"))
                else:
                    conn.execute(text(f"ALTER TABLE settings ADD COLUMN {col} {ddl}"))


def run_all(engine: Engine) -> None:
    """Run every migration in order, swallowing exceptions so a single failing
    statement doesn't take the whole app down (we'd rather serve stale schema
    and fix forward)."""
    for fn in (apply_transfer_support, apply_subscription_kind, apply_budgets_table, apply_notification_prefs):
        try:
            fn(engine)
        except Exception:
            log.exception("Auto-migration %s failed; continuing", fn.__name__)
