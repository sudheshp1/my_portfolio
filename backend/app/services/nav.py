"""Daily mutual fund NAVs from AMFI, used to revalue funds imported from a CAS statement.

Zerodha (Coin) funds already get their NAV from Kite on every sync, so only non-Zerodha
holdings are updated here.
"""

import time
from datetime import datetime

import requests
from sqlalchemy.orm import Session

from ..models import Account, Holding, Instrument
from .kite_auth import IST
from .kite_sync import ACCOUNT_NAME as ZERODHA_ACCOUNT
from .kite_sync import write_snapshot
from .reference import REF_DIR

NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
NAV_FILE = REF_DIR / "NAVAll.txt"
MAX_AGE_SECONDS = 6 * 3600  # AMFI publishes once a day, late evening


def _download(force: bool) -> None:
    if not force and NAV_FILE.exists() and time.time() - NAV_FILE.stat().st_mtime < MAX_AGE_SECONDS:
        return
    resp = requests.get(NAV_URL, headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
    resp.raise_for_status()
    if not resp.text.startswith("Scheme Code"):
        raise ValueError("Unexpected content from AMFI NAV file")
    REF_DIR.mkdir(exist_ok=True)
    NAV_FILE.write_text(resp.text, encoding="utf-8")


def load(force: bool = False) -> dict[str, tuple[float, datetime]]:
    """Returns {isin: (nav, nav_date)} for every scheme in the AMFI file."""
    _download(force)
    navs: dict[str, tuple[float, datetime]] = {}
    for line in NAV_FILE.read_text(encoding="utf-8").splitlines():
        # Code;ISIN growth/payout;ISIN reinvest;Name;[Plan;Option;]NAV;Date — NAV and date are always last
        fields = line.split(";")
        if len(fields) < 6 or not fields[0].strip().isdigit():
            continue
        try:
            nav = float(fields[-2])
            nav_date = datetime.strptime(fields[-1].strip(), "%d-%b-%Y")
        except ValueError:
            continue  # "N.A." NAVs and malformed rows
        for isin in (fields[1].strip(), fields[2].strip()):
            if isin.startswith("INF"):
                navs[isin] = (nav, nav_date)
    return navs


def refresh(db: Session, force: bool = False) -> dict:
    """Updates NAVs of non-Zerodha mutual fund holdings. Returns how many changed."""
    navs = load(force)
    rows = (
        db.query(Holding, Instrument)
        .join(Instrument, Holding.instrument_id == Instrument.id)
        .join(Account, Holding.account_id == Account.id)
        .filter(Instrument.asset_class == "mf", Account.name != ZERODHA_ACCOUNT)
        .all()
    )
    updated = 0
    latest = None
    for h, inst in rows:
        found = navs.get(inst.isin or "")
        if not found:
            continue
        nav, nav_date = found
        latest = max(latest, nav_date) if latest else nav_date
        if nav != h.last_price:
            h.last_price = nav
            h.as_of = datetime.now(IST).replace(tzinfo=None)
            updated += 1
    if updated:
        write_snapshot(db, datetime.now(IST).replace(tzinfo=None))
    db.commit()
    return {"updated": updated, "checked": len(rows), "nav_date": latest.date() if latest else None}
