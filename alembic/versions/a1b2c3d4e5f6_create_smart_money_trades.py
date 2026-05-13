"""create smart_money_trades

Revision ID: a1b2c3d4e5f6
Revises: ff9ee8cc45e7
Create Date: 2026-05-13 09:50:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "ff9ee8cc45e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "smart_money_trades",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_id", sa.String(), nullable=True),
        sa.Column("actor_type", sa.String(), nullable=False),
        sa.Column("actor_name", sa.String(), nullable=False),
        sa.Column("actor_party", sa.String(), nullable=True),
        sa.Column("actor_chamber", sa.String(), nullable=True),
        sa.Column("actor_state", sa.String(), nullable=True),
        sa.Column("ticker", sa.String(), nullable=True),
        sa.Column("asset_name", sa.String(), nullable=True),
        sa.Column("asset_type", sa.String(), nullable=True),
        sa.Column("transaction_type", sa.String(), nullable=True),
        sa.Column("transaction_date", sa.Date(), nullable=True),
        sa.Column("disclosure_date", sa.Date(), nullable=True),
        sa.Column("amount_min", sa.Numeric(20, 2), nullable=True),
        sa.Column("amount_max", sa.Numeric(20, 2), nullable=True),
        sa.Column("shares", sa.Numeric(20, 4), nullable=True),
        sa.Column("price", sa.Numeric(20, 4), nullable=True),
        sa.Column("value_usd", sa.Numeric(20, 2), nullable=True),
        sa.Column("raw_url", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source", "source_id", "actor_name", "ticker", "transaction_date",
            "transaction_type", "amount_min",
            name="uq_smart_money_dedup",
        ),
    )
    op.create_index("ix_smart_money_trades_id", "smart_money_trades", ["id"], unique=False)
    op.create_index("ix_smart_money_trades_source", "smart_money_trades", ["source"], unique=False)
    op.create_index("ix_smart_money_trades_source_id", "smart_money_trades", ["source_id"], unique=False)
    op.create_index("ix_smart_money_trades_actor_type", "smart_money_trades", ["actor_type"], unique=False)
    op.create_index("ix_smart_money_trades_actor_name", "smart_money_trades", ["actor_name"], unique=False)
    op.create_index("ix_smart_money_trades_ticker", "smart_money_trades", ["ticker"], unique=False)
    op.create_index("ix_smart_money_trades_transaction_type", "smart_money_trades", ["transaction_type"], unique=False)
    op.create_index("ix_smart_money_trades_transaction_date", "smart_money_trades", ["transaction_date"], unique=False)
    op.create_index("ix_smart_money_actor_date", "smart_money_trades", ["actor_name", "transaction_date"], unique=False)
    op.create_index("ix_smart_money_ticker_date", "smart_money_trades", ["ticker", "transaction_date"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_smart_money_ticker_date", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_actor_date", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_transaction_date", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_transaction_type", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_ticker", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_actor_name", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_actor_type", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_source_id", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_source", table_name="smart_money_trades")
    op.drop_index("ix_smart_money_trades_id", table_name="smart_money_trades")
    op.drop_table("smart_money_trades")
