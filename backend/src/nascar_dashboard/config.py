"""Settings, read from the environment (and a local `.env` during development)."""

from __future__ import annotations

from functools import cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # A plain SQLAlchemy URL, used instead of DSQL when set. Lets the app run
    # against SQLite or a local Postgres for development and tests.
    database_url: str | None = None

    dsql_endpoint: str | None = None
    dsql_user: str = "dashboard_reader"
    dsql_database: str = "postgres"
    aws_region: str | None = None

    # Origins allowed to call the API from a browser. The Vite dev server
    # proxies /api, so this only matters when the UI is served elsewhere.
    cors_origins: list[str] = ["http://localhost:5173"]


@cache
def get_settings() -> Settings:
    return Settings()
