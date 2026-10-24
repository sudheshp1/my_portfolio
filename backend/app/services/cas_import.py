"""Imports a CAMS / KFintech Consolidated Account Statement (CAS) PDF via casparser.

The CAS lists every mutual fund folio under your PAN, regardless of where you bought it.
Holdings from the CAS replace the previous CAS holdings (it's a full snapshot); transactions
are added and deduplicated, so importing overlapping statements is safe.

Depository statements (NSDL/CDSL) aren't supported yet: they also contain the Zerodha demat
holdings that Kite already provides, so importing them would double count.
"""

import hashlib
import io
from collections import Counter
from datetime import date, datetime

import casparser
from casparser.exceptions import CASParseError, IncorrectPasswordError
from casparser.types import CASData
from dateutil import parser as date_parser
from sqlalchemy.orm import Session

from ..models import Account, Holding, Instrument, Transaction
from .kite_auth import IST
from .kite_sync import ACCOUNT_NAME as ZERODHA_ACCOUNT
from .kite_sync import write_snapshot

ACCOUNT_NAME = "CAMS / KFintech"

# Transactions without units that still move money, from the investor's view
DIVIDEND_TYPES = {"DIVIDEND_PAYOUT"}
CHARGE_TYPES = {"STAMP_DUTY_TAX", "STT_TAX", "TDS_TAX"}


def parse(content: bytes, password: str) -> CASData:
    try:
        data = casparser.read_cas_pdf(io.BytesIO(content), password)
    except IncorrectPasswordError:
        raise ValueError("Wrong password for this PDF. CAS PDFs are usually protected with the password you set when requesting it.")
    except CASParseError as e:
        raise ValueError(f"Couldn't read this PDF as a CAS statement: {e}")
    if not isinstance(data, CASData):
        raise ValueError(
            "This is a depository (NSDL/CDSL) statement. Please upload a CAMS/KFintech mutual fund CAS instead — "
            "depository statements also include your Zerodha holdings and aren't supported yet."
        )
    return data


def _to_date(value) -> date:
    if isinstance(value, date):
        return value
    text = str(value).strip()
    try:
        return date.fromisoformat(text)  # 2023-01-10
    except ValueError:
        return date_parser.parse(text, dayfirst=True).date()  # 10-Jan-2023, 10/01/2023


def _get_or_create_account(db: Session) -> Account:
    account = db.query(Account).filter_by(name=ACCOUNT_NAME).first()
    if account is None:
        account = Account(name=ACCOUNT_NAME, type="cas")
        db.add(account)
        db.flush()
    return account


def import_data(db: Session, data: CASData) -> dict:
    account = _get_or_create_account(db)
    instruments = {i.isin: i for i in db.query(Instrument).filter(Instrument.isin.isnot(None))}
    existing_ids = {tid for (tid,) in db.query(Transaction.external_id).filter(Transaction.external_id.isnot(None))}
    seen: Counter[str] = Counter()

    result = {
        "statement_period": f"{data.statement_period.from_} to {data.statement_period.to}",
        "cas_type": str(data.cas_type),
        "schemes": 0,
        "transactions": 0,
        "duplicates": 0,
        "warnings": list(data.parse_warnings),
    }

    # Aggregate per ISIN: the same scheme can sit in several folios
    positions: dict[str, dict] = {}
    for folio in data.folios:
        for scheme in folio.schemes:
            if not scheme.isin:
                result["warnings"].append(f"Skipped '{scheme.scheme}' (folio {folio.folio}): no ISIN in statement")
                continue
            inst = instruments.get(scheme.isin)
            if inst is None:
                inst = Instrument(isin=scheme.isin, symbol=scheme.isin, name=scheme.scheme.strip(), asset_class="mf")
                db.add(inst)
                db.flush()
                instruments[scheme.isin] = inst

            units = float(scheme.close)
            if units > 0:
                p = positions.setdefault(scheme.isin, {"inst": inst, "units": 0.0, "cost": 0.0, "cost_known": True})
                p["units"] += units
                p["nav"] = float(scheme.valuation.nav)
                p["date"] = _to_date(scheme.valuation.date)
                if scheme.valuation.cost is None:
                    p["cost_known"] = False
                else:
                    p["cost"] += float(scheme.valuation.cost)

            for t in scheme.transactions:
                txn = _transaction(t)
                if txn is None:
                    continue
                kind, quantity, amount, price = txn
                txn_date = _to_date(t.date)
                key = f"{folio.folio}|{scheme.isin}|{txn_date}|{t.type}|{t.units}|{t.amount}"
                seen[key] += 1
                external_id = "cas:" + hashlib.sha1(f"{key}|{seen[key]}".encode()).hexdigest()[:40]
                if external_id in existing_ids:
                    result["duplicates"] += 1
                    continue
                db.add(
                    Transaction(
                        account_id=account.id,
                        instrument_id=inst.id,
                        date=txn_date,
                        type=kind,
                        quantity=quantity,
                        price=price,
                        amount=amount,
                        external_id=external_id,
                    )
                )
                existing_ids.add(external_id)
                result["transactions"] += 1

    # The CAS is a full snapshot of these folios: replace previous CAS holdings
    db.query(Holding).filter_by(account_id=account.id).delete()
    now = datetime.now(IST).replace(tzinfo=None)
    zerodha_isins = {
        inst.isin
        for _, inst in db.query(Holding, Instrument)
        .join(Instrument, Holding.instrument_id == Instrument.id)
        .join(Account, Holding.account_id == Account.id)
        .filter(Account.name == ZERODHA_ACCOUNT, Instrument.asset_class == "mf")
    }
    for isin, p in positions.items():
        if not p["cost_known"]:
            result["warnings"].append(f"No cost in statement for {p['inst'].name}; P&L for it will show as zero")
        avg_cost = p["cost"] / p["units"] if p["cost_known"] else p["nav"]
        db.add(
            Holding(
                account_id=account.id,
                instrument_id=p["inst"].id,
                quantity=p["units"],
                avg_cost=avg_cost,
                last_price=p["nav"],
                day_change=0.0,
                as_of=now,
            )
        )
        if isin in zerodha_isins:
            result["warnings"].append(
                f"{p['inst'].name} is also held via Zerodha Coin — check it isn't counted twice"
            )
        result["schemes"] += 1

    db.flush()
    write_snapshot(db, now)
    db.commit()
    return result


def _transaction(t) -> tuple[str, float, float, float] | None:
    """Maps a casparser transaction to (type, quantity, amount, price), or None to skip it.

    Unit-bearing rows are classified by the sign of units, which also handles reversals
    (a reversed purchase has negative units and nets out against the original).
    """
    if t.amount is None:
        return None
    amount = abs(float(t.amount))
    units = float(t.units) if t.units is not None else 0.0
    if units:
        kind = "buy" if units > 0 else "sell"
        quantity = abs(units)
        price = float(t.nav) if t.nav is not None else amount / quantity
        return kind, quantity, amount, price
    if t.type in DIVIDEND_TYPES:
        return "dividend", 0.0, amount, 0.0
    if t.type in CHARGE_TYPES:
        return "charge", 0.0, amount, 0.0
    return None
