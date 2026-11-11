"""Litestar application."""

from __future__ import annotations

from collections.abc import Callable, Iterator

from litestar import Litestar, Router, get
from litestar.config.compression import CompressionConfig
from litestar.config.cors import CORSConfig
from litestar.datastructures import MutableScopeHeaders
from litestar.di import Provide
from litestar.logging.config import LoggingConfig
from litestar.openapi import OpenAPIConfig
from litestar.types import Message, Scope
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_session
from .routes import races, replay, standings


@get("/health", sync_to_thread=False)
def health() -> dict[str, str]:
    return {"status": "ok"}


async def vary_on_accept_encoding(message: Message, scope: Scope) -> None:
    """Add `Accept-Encoding` to `Vary` on compressed responses, since CORS overwrites `Vary`."""
    if message["type"] != "http.response.start":
        return
    headers = MutableScopeHeaders.from_message(message)
    if "content-encoding" in headers and "accept-encoding" not in headers.get("vary", "").lower():
        headers.extend_header_value("vary", "Accept-Encoding")


def create_app(session_provider: Callable[[], Iterator[Session]] = get_session) -> Litestar:
    """Build the app, opening each request's database session with `session_provider`."""
    api = Router("/api", route_handlers=[health, races.router, replay.router, standings.router])
    return Litestar(
        route_handlers=[api],
        dependencies={"session": Provide(session_provider)},
        compression_config=CompressionConfig(backend="gzip", minimum_size=1024),
        cors_config=CORSConfig(
            allow_origins=get_settings().cors_origins,
            allow_methods=["GET"],
            allow_headers=["*"],
        ),
        openapi_config=OpenAPIConfig(title="NasDash API", version="0.1.0"),
        logging_config=LoggingConfig(log_exceptions="always", disable_stack_trace={400, 404, 405}),
        before_send=[vary_on_accept_encoding],
    )


app = create_app()
