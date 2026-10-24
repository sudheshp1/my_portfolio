from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from kiteconnect import KiteConnect
from sqlalchemy.orm import Session

from ..config import settings
from ..crypto import decrypt, encrypt
from ..models import KiteSession

IST = ZoneInfo("Asia/Kolkata")
TOKEN_RESET = time(6, 0)  # Kite access tokens expire around 6 AM IST every day


def new_client() -> KiteConnect:
    if not settings.kite_api_key:
        raise RuntimeError("KITE_API_KEY is not set in backend/.env")
    return KiteConnect(api_key=settings.kite_api_key)


def next_expiry(now: datetime) -> datetime:
    expiry = datetime.combine(now.date(), TOKEN_RESET, tzinfo=IST)
    return expiry if now < expiry else expiry + timedelta(days=1)


def create_session(db: Session, request_token: str) -> KiteSession:
    kite = new_client()
    data = kite.generate_session(request_token, api_secret=settings.kite_api_secret)

    now = datetime.now(IST)
    db.query(KiteSession).delete()
    session = KiteSession(
        user_id=data["user_id"],
        access_token_enc=encrypt(data["access_token"]),
        created_at=now.replace(tzinfo=None),
        expires_at=next_expiry(now).replace(tzinfo=None),
    )
    db.add(session)
    db.commit()
    return session


def active_session(db: Session) -> KiteSession | None:
    session = db.query(KiteSession).first()
    now = datetime.now(IST).replace(tzinfo=None)
    if session is None or session.expires_at <= now:
        return None
    return session


def authed_client(db: Session) -> KiteConnect | None:
    session = active_session(db)
    if session is None:
        return None
    kite = new_client()
    kite.set_access_token(decrypt(session.access_token_enc))
    return kite
