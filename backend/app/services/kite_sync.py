"""Pulls holdings, Coin MF holdings and cash from Kite into the local DB."""

from datetime import datetime

from kiteconnect import KiteConnect
from sqlalchemy.orm import Session

from ..models import Account, DailySnapshot, Holding, Instrument
from .kite_auth import IST

ACCOUNT_NAME = "Zerodha"
CASH_SYMBOL = "ZERODHA_CASH"


def get_or_create_account(db: Session) -> Account:
    account = db.query(Account).filter_by(name=ACCOUNT_NAME).first()
    if account is None:
        account = Account(name=ACCOUNT_NAME, type="broker")
        db.add(account)
        db.flush()
    return account


def _upsert_instrument(db: Session, *, isin, symbol, name, asset_class) -> Instrument:
    query = db.query(Instrument)
    inst = query.filter_by(isin=isin).first() if isin else query.filter_by(symbol=symbol, isin=None).first()
    if inst is None:
        inst = Instrument(isin=isin, symbol=symbol, name=name, asset_class=asset_class)
        db.add(inst)
        db.flush()
    else:
        inst.symbol = symbol
        inst.name = name or inst.name
    return inst


def _add_holding(db, account, inst, *, quantity, avg_cost, last_price, day_change, as_of):
    db.add(
        Holding(
            account_id=account.id,
            instrument_id=inst.id,
            quantity=quantity,
            avg_cost=avg_cost,
            last_price=last_price,
            day_change=day_change,
            as_of=as_of,
        )
    )


def sync(db: Session, kite: KiteConnect) -> dict:
    now = datetime.now(IST).replace(tzinfo=None)
    account = get_or_create_account(db)
    counts = {"equity": 0, "mf": 0, "cash": 0}
    errors = {}

    # Fetch everything first so a failed call doesn't wipe existing data for that category
    fetched = {}
    for key, call in (("equity", kite.holdings), ("mf", kite.mf_holdings), ("cash", kite.margins)):
        try:
            fetched[key] = call()
        except Exception as e:  # noqa: BLE001  (report per-source failures, keep the rest)
            errors[key] = str(e)

    # Replace this account's holdings, but keep rows of any category that failed to fetch
    keep_classes = {k for k in ("equity", "mf", "cash") if k not in fetched}
    existing = db.query(Holding).filter_by(account_id=account.id).all()
    for h in existing:
        if db.get(Instrument, h.instrument_id).asset_class not in keep_classes:
            db.delete(h)
    db.flush()

    for h in fetched.get("equity", []):
        quantity = h["quantity"] + h.get("t1_quantity", 0)
        if quantity <= 0:
            continue
        inst = _upsert_instrument(
            db, isin=h["isin"], symbol=h["tradingsymbol"], name=h["tradingsymbol"], asset_class="equity"
        )
        _add_holding(
            db, account, inst,
            quantity=quantity,
            avg_cost=h["average_price"],
            last_price=h["last_price"],
            day_change=h.get("day_change", 0.0),
            as_of=now,
        )
        counts["equity"] += 1

    for h in fetched.get("mf", []):
        if h["quantity"] <= 0:
            continue
        inst = _upsert_instrument(
            db, isin=h["tradingsymbol"], symbol=h["tradingsymbol"], name=h["fund"], asset_class="mf"
        )
        _add_holding(
            db, account, inst,
            quantity=h["quantity"],
            avg_cost=h["average_price"],
            last_price=h["last_price"],
            day_change=0.0,
            as_of=now,
        )
        counts["mf"] += 1

    if "cash" in fetched:
        cash = fetched["cash"].get("equity", {}).get("net", 0.0)
        inst = _upsert_instrument(
            db, isin=None, symbol=CASH_SYMBOL, name="Zerodha funds", asset_class="cash"
        )
        _add_holding(db, account, inst, quantity=1, avg_cost=cash, last_price=cash, day_change=0.0, as_of=now)
        counts["cash"] = 1

    db.flush()
    write_snapshot(db, now)
    db.commit()
    return {"synced_at": now, "counts": counts, "errors": errors}


def write_snapshot(db: Session, now: datetime) -> None:
    """Stores today's invested/current value per asset class (overwrites earlier syncs today)."""
    totals: dict[str, list[float]] = {}
    rows = db.query(Holding, Instrument).join(Instrument, Holding.instrument_id == Instrument.id).all()
    for h, inst in rows:
        t = totals.setdefault(inst.asset_class, [0.0, 0.0])
        t[0] += h.quantity * h.avg_cost
        t[1] += h.quantity * h.last_price

    today = now.date()
    db.query(DailySnapshot).filter_by(date=today).delete()
    for asset_class, (invested, current) in totals.items():
        db.add(DailySnapshot(date=today, asset_class=asset_class, invested=invested, current_value=current))
