"""Imports a Zerodha Console tradebook CSV (Console → Reports → Tradebook → Download CSV).

Kite's API only returns today's trades, so historical buys/sells come from this export.
Equity (EQ) and Coin mutual fund (MF) rows are imported; F&O, currency and commodity rows are skipped.
Re-importing the same or an overlapping file is safe: rows are deduplicated by trade_id.
"""

import csv
import hashlib
import io
from collections import Counter
from datetime import date, datetime

from sqlalchemy.orm import Session

from ..models import Instrument, Transaction
from .kite_sync import get_or_create_account

REQUIRED = {"symbol", "isin", "trade_date", "trade_type", "quantity", "price"}
SEGMENT_CLASSES = {"EQ": "equity", "MF": "mf"}
DATE_FORMATS = ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y")


def _parse_date(value: str) -> date:
    day = value.strip().split("T")[0].split(" ")[0]  # drop any time part
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(day, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date '{value}'")


def _parse_number(value: str) -> float:
    return float(value.replace(",", "").strip())


def import_csv(db: Session, content: bytes) -> dict:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    headers = {(h or "").strip().lower() for h in reader.fieldnames or []}
    missing = REQUIRED - headers
    if missing:
        raise ValueError(
            f"This doesn't look like a Console tradebook CSV — missing columns: {', '.join(sorted(missing))}"
        )

    account = get_or_create_account(db)
    instruments = {i.isin: i for i in db.query(Instrument).filter(Instrument.isin.isnot(None))}
    existing_ids = {tid for (tid,) in db.query(Transaction.external_id).filter(Transaction.external_id.isnot(None))}
    seen_rows: Counter[str] = Counter()

    result = {"imported": 0, "duplicates": 0, "skipped_segments": 0, "errors": []}
    for line_no, raw in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
        segment = row.get("segment", "EQ").upper() or "EQ"
        if segment not in SEGMENT_CLASSES:
            result["skipped_segments"] += 1
            continue
        try:
            isin = row["isin"]
            trade_type = row["trade_type"].lower()
            if trade_type not in ("buy", "sell"):
                raise ValueError(f"unknown trade_type '{row['trade_type']}'")
            quantity = _parse_number(row["quantity"])
            price = _parse_number(row["price"])
            trade_date = _parse_date(row["trade_date"])
        except (KeyError, ValueError) as e:
            if len(result["errors"]) < 5:
                result["errors"].append(f"Line {line_no}: {e}")
            continue

        # Prefer Zerodha's trade_id; otherwise a stable hash of the row (+ its repeat count in this file)
        trade_id = row.get("trade_id")
        if not trade_id:
            key = "|".join(row.get(k, "") for k in sorted(REQUIRED))
            seen_rows[key] += 1
            trade_id = "h:" + hashlib.sha1(f"{key}|{seen_rows[key]}".encode()).hexdigest()[:40]
        external_id = f"zerodha:{segment}:{trade_id}"
        if external_id in existing_ids:
            result["duplicates"] += 1
            continue

        inst = instruments.get(isin)
        if inst is None:
            inst = Instrument(isin=isin, symbol=row["symbol"], name=row["symbol"], asset_class=SEGMENT_CLASSES[segment])
            db.add(inst)
            db.flush()
            instruments[isin] = inst

        db.add(
            Transaction(
                account_id=account.id,
                instrument_id=inst.id,
                date=trade_date,
                type=trade_type,
                quantity=quantity,
                price=price,
                amount=quantity * price,
                external_id=external_id,
            )
        )
        existing_ids.add(external_id)
        result["imported"] += 1

    db.commit()
    return result
