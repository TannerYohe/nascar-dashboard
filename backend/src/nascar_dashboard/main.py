"""Litestar application."""

from __future__ import annotations

from collections.abc import Callable, Iterator

from litestar import Litestar, Router, get
from litestar.config.compression import CompressionConfig
from litestar.config.cors import CORSConfig
from litestar.di import Provide
from litestar.logging.config import LoggingConfig
from litestar.openapi import OpenAPIConfig
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_session
from .routes import races, replay


@get("/health", sync_to_thread=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


def create_app(session_provider: Callable[[], Iterator[Session]] = get_session) -> Litestar:
    """Build the app, opening each request's database session with `session_provider`."""
    api = Router("/api", route_handlers=[health, races.router, replay.router])
    return Litestar(
        route_handlers=[api],
        dependencies={"session": Provide(session_provider)},
        compression_config=CompressionConfig(backend="gzip", minimum_size=1024),
        cors_config=CORSConfig(
            allow_origins=get_settings().cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        ),
        openapi_config=OpenAPIConfig(title="NASCAR Dashboard API", version="0.1.0"),
        logging_config=LoggingConfig(log_exceptions="always"),
    )


app = create_app()
