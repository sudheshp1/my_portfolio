from fastapi import APIRouter, Depends, HTTPException
from kiteconnect.exceptions import KiteException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Account, DailySnapshot, Holding, Instrument
from ..services import kite_auth, kite_sync

router = APIRouter(tags=["portfolio"])


def _require_kite(db: Session):
    kite = kite_auth.authed_client(db)
    if kite is None:
        raise HTTPException(401, "Not connected to Kite. Visit /kite/login")
    return kite


@router.post("/sync")
def sync(db: Session = Depends(get_db)):
    """Pulls the latest data from Kite into the local DB."""
    return kite_sync.sync(db, _require_kite(db))


@router.get("/holdings")
def holdings(db: Session = Depends(get_db)):
    rows = (
        db.query(Holding, Instrument, Account)
        .join(Instrument, Holding.instrument_id == Instrument.id)
        .join(Account, Holding.account_id == Account.id)
        .all()
    )
    result = []
    for h, inst, acc in rows:
        invested = h.quantity * h.avg_cost
        current = h.quantity * h.last_price
        pnl = current - invested
        prev_price = h.last_price - h.day_change
        result.append(
            {
                "account": acc.name,
                "isin": inst.isin,
                "symbol": inst.symbol,
                "name": inst.name,
                "asset_class": inst.asset_class,
                "quantity": h.quantity,
                "avg_cost": h.avg_cost,
                "last_price": h.last_price,
                "invested": invested,
                "current_value": current,
                "pnl": pnl,
                "pnl_pct": pnl / invested * 100 if invested else 0.0,
                "day_change": h.quantity * h.day_change,
                "day_change_pct": h.day_change / prev_price * 100 if prev_price else 0.0,
                "as_of": h.as_of,
            }
        )
    return sorted(result, key=lambda r: r["current_value"], reverse=True)


@router.get("/summary")
def summary(db: Session = Depends(get_db)):
    items = holdings(db)
    by_class: dict[str, dict] = {}
    for r in items:
        c = by_class.setdefault(r["asset_class"], {"invested": 0.0, "current_value": 0.0, "day_change": 0.0})
        c["invested"] += r["invested"]
        c["current_value"] += r["current_value"]
        c["day_change"] += r["day_change"]

    invested = sum(c["invested"] for c in by_class.values())
    current = sum(c["current_value"] for c in by_class.values())
    day_change = sum(c["day_change"] for c in by_class.values())
    previous = current - day_change
    return {
        "invested": invested,
        "current_value": current,
        "pnl": current - invested,
        "pnl_pct": (current - invested) / invested * 100 if invested else 0.0,
        "day_change": day_change,
        "day_change_pct": day_change / previous * 100 if previous else 0.0,
        "by_asset_class": by_class,
        "last_synced": db.query(func.max(Holding.as_of)).scalar(),
        "kite_connected": kite_auth.active_session(db) is not None,
    }


@router.get("/history")
def history(db: Session = Depends(get_db)):
    """Total invested and current value per day, from the snapshots written on each sync."""
    rows = (
        db.query(DailySnapshot.date, func.sum(DailySnapshot.invested), func.sum(DailySnapshot.current_value))
        .group_by(DailySnapshot.date)
        .order_by(DailySnapshot.date)
        .all()
    )
    return [{"date": d, "invested": inv, "current_value": cur} for d, inv, cur in rows]


@router.get("/positions")
def positions(db: Session = Depends(get_db)):
    """Live intraday/F&O positions straight from Kite (not stored)."""
    try:
        return _require_kite(db).positions()["net"]
    except KiteException as e:
        raise HTTPException(502, f"Kite error: {e}")
