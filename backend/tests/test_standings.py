import datetime

import pytest
from litestar.testing import TestClient
from sqlalchemy.orm import Session, sessionmaker

from nascar_dashboard.models import PointsStanding, Race, RaceResult
from nascar_dashboard.schemas import RaceSummary
from nascar_dashboard.services.standings import playoff_format

YEAR = 2030
UTC = datetime.UTC

# Two regular-season races and two Chase races; the Chase field is two drivers.
# race_id -> (playoff_round, {driver_id: (position, points, earned, in_chase)})
SEASON = {
    301: (0, {1: (2, 40, 40, False), 2: (1, 55, 55, False), 3: (3, 30, 30, False)}),
    302: (0, {1: (1, 95, 55, False), 2: (2, 90, 35, False), 3: (3, 60, 30, False)}),
    303: (1, {1: (2, 2130, 30, True), 2: (1, 2130, 55, True), 3: (3, 95, 35, False)}),
    304: (1, {1: (1, 2185, 55, True), 2: (2, 2160, 30, True), 3: (3, 129, 34, False)}),
}
NAMES = {1: ("Alpha", "One (C)"), 2: ("* Bravo", "Two #"), 3: ("Charlie", "Three(i)")}


@pytest.fixture
def season(db: sessionmaker[Session]) -> None:
    with db() as session:
        for week, (race_id, (playoff_round, standings)) in enumerate(SEASON.items()):
            session.add(
                Race(
                    race_id=race_id,
                    series_id=1,
                    race_season=YEAR,
                    race_type_id=1,
                    playoff_round=playoff_round,
                    race_date=datetime.datetime(YEAR, 3, 1 + 7 * week, tzinfo=UTC),
                )
            )
            winner = next(d for d, (_, _, earned, _) in standings.items() if earned == 55)
            session.add(
                RaceResult(race_id=race_id, result_id=1, driver_id=winner, finishing_position=1)
            )
            for driver_id, (position, points, earned, in_chase) in standings.items():
                first, last = NAMES[driver_id]
                session.add(
                    PointsStanding(
                        race_id=race_id,
                        run_id=0,
                        driver_id=driver_id,
                        first_name=first,
                        last_name=last,
                        # Charlie's last row has no car number.
                        car_number=None if (race_id, driver_id) == (304, 3) else driver_id * 11,
                        points=points,
                        points_position=position,
                        points_earned_this_race=earned,
                        is_in_chase=in_chase,
                        is_points_eligible=True,
                        is_rookie=driver_id == 2,
                    )
                )
        # A driver racing for points in another series is left out.
        session.add(
            PointsStanding(
                race_id=304, run_id=0, driver_id=9, points_position=4, is_points_eligible=False
            )
        )
        session.commit()


def standings(client: TestClient, **params) -> dict:
    response = client.get("/api/standings", params={"year": YEAR, **params})
    assert response.status_code == 200
    return response.json()


@pytest.mark.usefixtures("season")
def test_season_standings(client: TestClient) -> None:
    body = standings(client)
    assert body["format"] == "chase"
    assert body["playoff_field"] == 2
    assert body["standings_through"] == 4
    assert [r["race_id"] for r in body["races"]] == list(SEASON)
    assert body["regular_season_champion_id"] == 1
    assert body["champion_id"] == 1

    alpha, bravo, charlie = body["drivers"]
    assert [d["name"] for d in body["drivers"]] == [
        "Alpha One (C)",
        "* Bravo Two #",
        "Charlie Three(i)",
    ]
    assert alpha["positions"] == [2, 1, 2, 1]
    assert alpha["points"] == [40, 95, 2130, 2185]
    assert alpha["in_playoffs"] == [False, False, True, True]
    assert bravo["is_rookie"] and not alpha["is_rookie"]
    assert charlie["playoff_seed"] is None
    assert charlie["car_number"] == 33


@pytest.mark.usefixtures("season")
def test_playoff_seeds_come_from_points_before_the_first_playoff_race(client: TestClient) -> None:
    alpha, bravo, _ = standings(client)["drivers"]
    assert (alpha["playoff_seed"], alpha["playoff_start_points"]) == (1, 2100)
    assert (bravo["playoff_seed"], bravo["playoff_start_points"]) == (2, 2075)


@pytest.mark.usefixtures("season")
def test_standings_stop_at_the_last_race_with_standings(
    client: TestClient, db: sessionmaker[Session]
) -> None:
    with db() as session:
        session.query(PointsStanding).filter(PointsStanding.race_id == 304).delete()
        session.commit()
    body = standings(client)
    assert body["standings_through"] == 3
    assert body["champion_id"] is None
    assert len(body["drivers"][0]["positions"]) == 3


def test_season_without_races_is_404(client: TestClient) -> None:
    assert client.get("/api/standings", params={"year": 1990}).status_code == 404


def test_season_without_standings_falls_back_to_the_series_field(client: TestClient) -> None:
    body = client.get("/api/standings", params={"year": 2025}).json()
    assert body["standings_through"] == 0
    assert body["drivers"] == []
    assert body["playoff_field"] == 16
    assert body["format"] == "none"


def _race(playoff_round: int | None) -> RaceSummary:
    return RaceSummary.model_construct(playoff_round=playoff_round)


@pytest.mark.parametrize(
    ("rounds", "expected"),
    [([None, None], "none"), ([None, 1, 1], "chase"), ([None, 1, 2, 3, 4], "elimination")],
)
def test_playoff_format(rounds: list[int | None], expected: str) -> None:
    assert playoff_format([_race(r) for r in rounds]) == expected
