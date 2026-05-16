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


def run_all(engine: Engine) -> None:
    """Run every migration in order, swallowing exceptions so a single failing
    statement doesn't take the whole app down (we'd rather serve stale schema
    and fix forward)."""
    try:
        apply_transfer_support(engine)
    except Exception:
        log.exception("Auto-migration failed; continuing with current schema")
