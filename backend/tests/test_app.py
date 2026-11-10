import logging
from collections.abc import Generator, Iterator
from contextlib import contextmanager

import pytest
from litestar.testing import TestClient
from sqlalchemy.orm import Session

from conftest import RACE_ID
from nascar_dashboard.main import create_app


def _broken_session() -> Iterator[Session]:
    raise RuntimeError("database unreachable")
    yield


@contextmanager
def _capturing_litestar_logs(caplog: pytest.LogCaptureFixture) -> Generator[None]:
    """Send records from the `litestar` logger, which doesn't propagate, to `caplog`."""
    logger = logging.getLogger("litestar")
    logger.addHandler(caplog.handler)
    try:
        yield
    finally:
        logger.removeHandler(caplog.handler)


def test_unhandled_error_is_a_logged_500(caplog: pytest.LogCaptureFixture) -> None:
    app = create_app(session_provider=_broken_session)
    with TestClient(app) as client, _capturing_litestar_logs(caplog):
        response = client.get("/api/seasons")

    assert response.status_code == 500
    assert any(r.levelno >= logging.ERROR for r in caplog.records)
    assert "RuntimeError: database unreachable" in caplog.text


@pytest.mark.parametrize(
    ("method", "path", "status"),
    [
        ("GET", "/api/races/12345", 404),
        ("GET", "/api/races/abc", 404),
        ("GET", "/wp-login.php", 404),
        ("GET", "/api/races?series=9", 400),
        ("POST", "/api/seasons", 405),
    ],
)
def test_client_errors_are_not_logged(
    client: TestClient, caplog: pytest.LogCaptureFixture, method: str, path: str, status: int
) -> None:
    with _capturing_litestar_logs(caplog):
        response = client.request(method, path)

    assert response.status_code == status
    assert not [r for r in caplog.records if r.levelno >= logging.ERROR]


def test_allowed_origin_gets_cors_headers(client: TestClient) -> None:
    response = client.get("/api/seasons", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_other_origin_gets_no_cors_headers(client: TestClient) -> None:
    response = client.get("/api/seasons", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in response.headers


def test_compressed_cross_origin_response_varies_on_both(client: TestClient) -> None:
    response = client.get(
        f"/api/races/{RACE_ID}/replay",
        headers={"Accept-Encoding": "gzip", "Origin": "http://localhost:5173"},
    )
    assert response.headers["content-encoding"] == "gzip"
    vary = {v.strip().lower() for v in response.headers["vary"].split(",")}
    assert vary == {"accept-encoding", "origin"}
