"""SQLAlchemy engine for the Aurora DSQL cluster cadence populates.

Adapted from cadence/src/cadence/db/engine.py. The dashboard only reads, so it
connects as a read-only role (dashboard_reader by default).
"""

from __future__ import annotations

from collections.abc import Iterator
from functools import cache

from sqlalchemy import Engine, create_engine, event, make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from .config import get_settings

# DSQL closes connections after an hour. Recycle short of that.
POOL_RECYCLE_SECONDS = 3300


def build_dsn(endpoint: str, user: str, dbname: str = "postgres", region: str | None = None) -> str:
    """Connector DSN for a DSQL cluster.

    verify-full with certifi's bundle: psycopg's bundled libpq verifies the
    server certificate, and psycopg-binary has no usable CA store on Windows.
    """
    import certifi

    dsn = (
        f"postgresql://{endpoint}/{dbname}"
        f"?user={user}&sslmode=verify-full&sslrootcert={certifi.where()}"
    )
    if region:
        dsn += f"&region={region}"
    return dsn


def _dsql_engine() -> Engine:
    import aurora_dsql_psycopg as dsql

    settings = get_settings()
    if not settings.dsql_endpoint:
        raise RuntimeError("Set DSQL_ENDPOINT (or DATABASE_URL for a non-DSQL database).")
    dsn = build_dsn(
        settings.dsql_endpoint,
        user=settings.dsql_user,
        dbname=settings.dsql_database,
        region=settings.aws_region,
    )
    return create_engine(
        "postgresql+psycopg://",
        creator=lambda: dsql.connect(dsn, autocommit=True),
        # DSQL has no SAVEPOINT, which the psycopg dialect issues on connect
        # unless the connection is in autocommit.
        isolation_level="AUTOCOMMIT",
        pool_pre_ping=True,
        pool_recycle=POOL_RECYCLE_SECONDS,
        pool_size=5,
        max_overflow=5,
    )


def _url_engine(url: str) -> Engine:
    if not url.startswith("sqlite"):
        return create_engine(url, pool_pre_ping=True)
    return sqlite_engine(make_url(url).database)


def sqlite_engine(path: str | None) -> Engine:
    """SQLite with `path` attached as the `nascar` schema the models live in.

    No path (or ":memory:") gives an in-memory database. That exists only on its
    own connection, so every session has to share one (StaticPool).
    """
    target = path or ":memory:"
    in_memory = target == ":memory:"
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool if in_memory else None,
    )

    @event.listens_for(engine, "connect")
    def _attach(dbapi_conn, _record) -> None:  # noqa: ANN001
        dbapi_conn.execute("ATTACH DATABASE ? AS nascar", (target,))

    return engine


@cache
def get_engine() -> Engine:
    url = get_settings().database_url
    return _url_engine(url) if url else _dsql_engine()


@cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request."""
    with get_sessionmaker()() as session:
        yield session
