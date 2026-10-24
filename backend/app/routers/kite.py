from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from kiteconnect.exceptions import KiteException
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..services import kite_auth, kite_sync

router = APIRouter(prefix="/kite", tags=["kite"])


@router.get("/login")
def login():
    """Redirects to Zerodha's login page."""
    return RedirectResponse(kite_auth.new_client().login_url())


@router.get("/callback")
def callback(status: str, request_token: str | None = None, db: Session = Depends(get_db)):
    """Kite redirects here after login with a one-time request_token."""
    if status != "success" or not request_token:
        raise HTTPException(400, f"Kite login failed (status={status})")
    try:
        kite_auth.create_session(db, request_token)
    except KiteException as e:
        raise HTTPException(400, f"Could not create Kite session: {e}")

    # Pull fresh data right away; a failure here shouldn't block the login itself
    synced = "ok"
    try:
        kite_sync.sync(db, kite_auth.authed_client(db))
    except Exception:  # noqa: BLE001
        db.rollback()
        synced = "failed"
    return RedirectResponse(f"{settings.frontend_url}/?kite=connected&sync={synced}")


@router.get("/status")
def status(db: Session = Depends(get_db)):
    session = kite_auth.active_session(db)
    if session is None:
        return {"connected": False}
    return {"connected": True, "user_id": session.user_id, "expires_at": session.expires_at}


@router.get("/profile")
def profile(db: Session = Depends(get_db)):
    """Calls Kite with the stored token; useful to confirm the session actually works."""
    kite = kite_auth.authed_client(db)
    if kite is None:
        raise HTTPException(401, "Not connected to Kite. Visit /kite/login")
    try:
        p = kite.profile()
    except KiteException as e:
        raise HTTPException(401, f"Kite rejected the session: {e}")
    return {"user_id": p["user_id"], "user_name": p["user_name"], "broker": p["broker"]}
