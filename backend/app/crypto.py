"""Encrypts secrets (the Kite access token) at rest with a locally generated key."""

from cryptography.fernet import Fernet

from .config import DATA_DIR

KEY_FILE = DATA_DIR / "secret.key"


def _fernet() -> Fernet:
    if not KEY_FILE.exists():
        KEY_FILE.write_bytes(Fernet.generate_key())
    return Fernet(KEY_FILE.read_bytes())


def encrypt(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()
