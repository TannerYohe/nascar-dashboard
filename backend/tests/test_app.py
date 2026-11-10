import logging
from collections.abc import Iterator

import pytest
from litestar.testing import TestClient
from sqlalchemy.orm import Session

from conftest import RACE_ID
from nascar_dashboard.main import create_app


def _broken_session() -> Iterator[Session]:
    raise RuntimeError("database unreachable")
    yield


def test_unhandled_error_is_a_logged_500(caplog: pytest.LogCaptureFixture) -> None:
    with TestClient(create_app(session_provider=_broken_session)) as client:
        logging.getLogger("litestar").addHandler(caplog.handler)
        try:
            response = client.get("/api/seasons")
        finally:
            logging.getLogger("litestar").removeHandler(caplog.handler)

    assert response.status_code == 500
    assert any(r.levelno >= logging.ERROR for r in caplog.records)
    assert "RuntimeError: database unreachable" in caplog.text


def test_compressed_cross_origin_response_varies_on_both(client: TestClient) -> None:
    response = client.get(
        f"/api/races/{RACE_ID}/replay",
        headers={"Accept-Encoding": "gzip", "Origin": "http://localhost:5173"},
    )
    assert response.headers["content-encoding"] == "gzip"
    vary = {v.strip().lower() for v in response.headers["vary"].split(",")}
    assert vary == {"accept-encoding", "origin"}
