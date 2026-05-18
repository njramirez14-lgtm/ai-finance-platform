"""One-shot insert of irrid's Trade Republic positions (2026-05-18)."""
import os
import sys
from decimal import Decimal

import psycopg
from dotenv import load_dotenv

load_dotenv(".env.prod")

HOLDINGS = [
    {"symbol": "VUSA.AS", "isin": "IE00B3XXRP09", "name": "Vanguard S&P 500 UCITS ETF (Dist)",
     "asset_type": "ETF", "quantity": Decimal("2.409152"), "avg_buy_price": Decimal("121.20"),
     "currency": "EUR", "broker": "Trade Republic"},
    {"symbol": "BTC-EUR", "isin": None, "name": "Bitcoin",
     "asset_type": "CRYPTO", "quantity": Decimal("0.001507"), "avg_buy_price": Decimal("66986.33"),
     "currency": "EUR", "broker": "Trade Republic"},
    {"symbol": "PLTR", "isin": "US69608A1088", "name": "Palantir Technologies",
     "asset_type": "STOCK", "quantity": Decimal("0.438827"), "avg_buy_price": Decimal("116.22"),
     "currency": "EUR", "broker": "Trade Republic"},
    {"symbol": "POET", "isin": "CA7307712039", "name": "POET Technologies",
     "asset_type": "STOCK", "quantity": Decimal("3.263707"), "avg_buy_price": Decimal("15.63"),
     "currency": "EUR", "broker": "Trade Republic"},
]


def main():
    url = os.environ["DATABASE_URL_UNPOOLED"]
    with psycopg.connect(url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users ORDER BY id")
            users = cur.fetchall()
            if not users:
                print("No users in DB — abort.")
                sys.exit(1)
            print("Users:")
            for u in users:
                print(f"  id={u[0]} email={u[1]}")
            user_id = users[0][0]
            print(f"\nUsing user_id={user_id}\n")

            cur.execute("SELECT symbol, quantity FROM holdings WHERE user_id=%s", (user_id,))
            existing = {row[0]: row[1] for row in cur.fetchall()}
            print(f"Existing holdings for user {user_id}: {len(existing)}")
            for s, q in existing.items():
                print(f"  {s}: {q}")

            inserted = 0
            skipped = 0
            for h in HOLDINGS:
                if h["symbol"] in existing:
                    print(f"SKIP {h['symbol']} (already exists)")
                    skipped += 1
                    continue
                cur.execute(
                    """INSERT INTO holdings
                       (user_id, symbol, isin, name, asset_type, quantity, avg_buy_price, currency, broker)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (user_id, h["symbol"], h["isin"], h["name"], h["asset_type"],
                     h["quantity"], h["avg_buy_price"], h["currency"], h["broker"]),
                )
                new_id = cur.fetchone()[0]
                print(f"INSERT {h['symbol']} -> id={new_id}")
                inserted += 1

            conn.commit()
            print(f"\nDone. Inserted={inserted} Skipped={skipped}")


if __name__ == "__main__":
    main()
