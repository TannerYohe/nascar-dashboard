import datetime

import pytest
from fastapi.testclient import TestClient

from conftest import RACE_ID
from nascar_dashboard.models import Race
from nascar_dashboard.services.races import _status

NOW = datetime.datetime(2025, 6, 1, 18, tzinfo=datetime.UTC)


def test_seasons_groups_series_by_year(client: TestClient) -> None:
    body = client.get("/api/seasons").json()
    assert body == [
        {"year": 2025, "series": [{"series_id": 1, "race_count": 3}]},
        {"year": 2024, "series": [{"series_id": 2, "race_count": 1}]},
    ]


def test_races_filters_and_numbers_points_rounds(client: TestClient) -> None:
    body = client.get("/api/races", params={"year": 2025, "series": 1}).json()
    assert [r["race_id"] for r in body] == [99, RACE_ID, 101]
    clash, race, upcoming = body
    assert clash["is_exhibition"] and clash["round"] is None
    assert race["round"] == 1 and upcoming["round"] == 2
    assert race["winner"] == {"driver_id": 1, "name": "Alpha One", "car_number": 11}
    assert race["has_lap_data"] and not upcoming["has_lap_data"]
    assert race["status"] == "finished"
    assert upcoming["status"] == "scheduled"


def test_all_races_without_filters(client: TestClient) -> None:
    assert len(client.get("/api/races").json()) == 4


def test_race_detail(client: TestClient) -> None:
    body = client.get(f"/api/races/{RACE_ID}").json()
    assert body["stage_ends"] == [2, 4, 6]
    assert body["track_length_mi"] == 1.5
    assert body["track_name"] == "Test Speedway"


def test_unknown_race_is_404(client: TestClient) -> None:
    assert client.get("/api/races/12345").status_code == 404
    assert client.get("/api/races/12345/replay").status_code == 404


def test_series_must_be_valid(client: TestClient) -> None:
    assert client.get("/api/races", params={"series": 7}).status_code == 422


@pytest.mark.parametrize("aware", [True, False], ids=["aware", "naive"])
@pytest.mark.parametrize(
    ("has_results", "started_ago", "expected"),
    [
        (True, datetime.timedelta(hours=1), "finished"),
        (False, -datetime.timedelta(hours=2), "scheduled"),
        (False, datetime.timedelta(hours=1), "live"),
        (False, datetime.timedelta(hours=9), "finished"),
    ],
    ids=["results", "future", "started-1h", "started-9h"],
)
def test_status(
    has_results: bool, started_ago: datetime.timedelta, expected: str, aware: bool
) -> None:
    start = NOW - started_ago
    # SQLite hands back naive UTC datetimes; DSQL timestamptz comes back aware.
    race = Race(race_date=start if aware else start.replace(tzinfo=None))
    assert _status(race, has_results, NOW) == expected


def test_status_without_a_date_is_scheduled() -> None:
    assert _status(Race(race_date=None), False, NOW) == "scheduled"
