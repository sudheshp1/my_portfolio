from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR.parent / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    kite_api_key: str = ""
    kite_api_secret: str = ""
    frontend_url: str = "http://localhost:3000"
    database_url: str = f"sqlite:///{(DATA_DIR / 'portfolio.db').as_posix()}"


settings = Settings()
DATA_DIR.mkdir(exist_ok=True)
