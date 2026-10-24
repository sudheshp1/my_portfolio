"""Sector and market-cap classification for stocks, from NSE index constituent lists.

Industry comes from the Nifty Total Market list (~750 stocks). Market-cap tier comes from
which index a stock belongs to: Nifty 100 = large, Midcap 150 = mid, Smallcap 250 = small,
Microcap 250 = micro. Anything else (ETFs, unlisted/SME stocks) stays unclassified.
"""

import csv
import time
from pathlib import Path

import requests
from sqlalchemy.orm import Session

from ..config import DATA_DIR
from ..models import Instrument

BASE_URL = "https://archives.nseindia.com/content/indices"
REF_DIR = DATA_DIR / "reference"
MAX_AGE_SECONDS = 30 * 86_400  # index constituents change twice a year; monthly refresh is plenty

INDUSTRY_LIST = "ind_niftytotalmarket_list"
CAP_LISTS = {
    "ind_nifty100list": "large",
    "ind_niftymidcap150list": "mid",
    "ind_niftysmallcap250list": "small",
    "ind_niftymicrocap250_list": "micro",
}

_cache: dict = {"loaded_at": 0.0, "map": {}}


def _download(name: str, force: bool) -> Path:
    path = REF_DIR / f"{name}.csv"
    if not force and path.exists() and time.time() - path.stat().st_mtime < MAX_AGE_SECONDS:
        return path
    resp = requests.get(f"{BASE_URL}/{name}.csv", headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    resp.raise_for_status()
    if not resp.text.startswith("Company Name"):
        raise ValueError(f"Unexpected content for {name}.csv")
    REF_DIR.mkdir(exist_ok=True)
    path.write_text(resp.text, encoding="utf-8")
    return path


def _rows(path: Path):
    with path.open(encoding="utf-8") as f:
        yield from csv.DictReader(f)


def load(force: bool = False) -> dict[str, dict]:
    """Returns {isin: {"sector": ..., "market_cap": ...}}, downloading lists when stale."""
    paths = {name: _download(name, force) for name in (INDUSTRY_LIST, *CAP_LISTS)}
    newest = max(p.stat().st_mtime for p in paths.values())
    if not force and _cache["map"] and _cache["loaded_at"] >= newest:
        return _cache["map"]

    ref: dict[str, dict] = {}
    for row in _rows(paths[INDUSTRY_LIST]):
        ref[row["ISIN Code"].strip()] = {"sector": row["Industry"].strip(), "market_cap": None}
    for name, tier in CAP_LISTS.items():
        for row in _rows(paths[name]):
            entry = ref.setdefault(row["ISIN Code"].strip(), {"sector": row["Industry"].strip(), "market_cap": None})
            entry["market_cap"] = tier

    _cache.update(loaded_at=newest, map=ref)
    return ref


def reference_date() -> float | None:
    path = REF_DIR / f"{INDUSTRY_LIST}.csv"
    return path.stat().st_mtime if path.exists() else None


def classify(db: Session, force: bool = False) -> int:
    """Sets sector/market_cap on all stock instruments. Returns how many were matched."""
    ref = load(force)
    matched = 0
    for inst in db.query(Instrument).filter_by(asset_class="equity"):
        info = ref.get(inst.isin or "")
        inst.sector = info["sector"] if info else None
        inst.market_cap = info["market_cap"] if info else None
        matched += info is not None
    db.commit()
    return matched
