from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401  (registers tables on Base.metadata)

    Base.metadata.create_all(engine)
    _migrate()


def _migrate():
    """Adds columns introduced after a table was first created (create_all doesn't alter tables)."""
    columns = {c["name"] for c in inspect(engine).get_columns("transactions")}
    if "external_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN external_id VARCHAR(64)"))
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_external_id ON transactions (external_id)")
            )
