import datetime

import pytest
from litestar.testing import TestClient
from sqlalchemy.orm import Session, sessionmaker

from nascar_dashboard.models import PointsStanding, Race, RaceResult
from nascar_dashboard.schemas import RaceSummary
from nascar_dashboard.services.standings import playoff_format

UTC = datetime.UTC
NAMES = {1: ("Alpha", "One (C)"), 2: ("* Bravo", "Two #"), 3: ("Charlie", "Three(i)")}

# race_id -> (playoff_round, {driver_id: (position, points, earned, in_playoffs)})
type Season = dict[int, tuple[int, dict[int, tuple[int, int, int, bool]]]]

# Two regular-season races, then two Chase races with a field of two. Bravo leads the regular
# season, and both reset to 2,100 points.
CHASE_YEAR = 2030
CHASE: Season = {
    301: (0, {1: (2, 40, 40, False), 2: (1, 55, 55, False), 3: (3, 30, 30, False)}),
    302: (0, {1: (2, 90, 50, False), 2: (1, 95, 40, False), 3: (3, 60, 30, False)}),
    303: (1, {1: (2, 2130, 30, True), 2: (1, 2155, 55, True), 3: (3, 95, 35, False)}),
    304: (1, {1: (1, 2185, 55, True), 2: (2, 2175, 20, True), 3: (3, 129, 34, False)}),
}

# One regular-season race, a round of two, then a final of one. Alpha is cut after round one.
ELIMINATION_YEAR = 2031
ELIMINATION: Season = {
    401: (0, {1: (1, 50, 50, False), 2: (2, 40, 40, False), 3: (3, 30, 30, False)}),
    402: (1, {1: (1, 2070, 55, True), 2: (2, 2040, 30, True), 3: (3, 60, 30, False)}),
    403: (2, {2: (1, 3055, 55, True), 1: (2, 2090, 20, False), 3: (3, 90, 30, False)}),
}


def add_season(session: Session, year: int, season: Season, run_ids: dict[int, int]) -> None:
    """Adds `season`'s races, winners and standings, each race's standings under `run_ids`."""
    for week, (race_id, (playoff_round, standings)) in enumerate(season.items()):
        session.add(
            Race(
                race_id=race_id,
                series_id=1,
                race_season=year,
                race_type_id=1,
                playoff_round=playoff_round,
                race_date=datetime.datetime(year, 3, 1 + 7 * week, tzinfo=UTC),
            )
        )
        winner = max(standings, key=lambda d: standings[d][2])
        session.add(
            RaceResult(race_id=race_id, result_id=1, driver_id=winner, finishing_position=1)
        )
        for driver_id, (position, points, earned, in_playoffs) in standings.items():
            first, last = NAMES[driver_id]
            session.add(
                PointsStanding(
                    race_id=race_id,
                    run_id=run_ids.get(race_id, 0),
                    driver_id=driver_id,
                    first_name=first,
                    last_name=last,
                    car_number=driver_id * 11,
                    points=points,
                    points_position=position,
                    points_earned_this_race=earned,
                    is_in_chase=in_playoffs,
                    is_points_eligible=True,
                    is_rookie=driver_id == 2,
                )
            )


@pytest.fixture
def chase(db: sessionmaker[Session]) -> None:
    with db() as session:
        # The last race's standings are run 1; run 0 is an older copy that should be ignored.
        add_season(session, CHASE_YEAR, CHASE, run_ids={304: 1})
        for driver_id in [*NAMES, 4]:
            session.add(
                PointsStanding(
                    race_id=304,
                    run_id=0,
                    driver_id=driver_id,
                    points=0,
                    points_position=4 - driver_id,
                    is_points_eligible=True,
                )
            )
        # Charlie's last row has no car number.
        session.flush()
        charlie_last = session.get(PointsStanding, (304, 1, 3))
        assert charlie_last is not None
        charlie_last.car_number = None
        # A driver racing for points in another series is left out.
        session.add(
            PointsStanding(
                race_id=304, run_id=1, driver_id=9, points_position=4, is_points_eligible=False
            )
        )
        session.commit()


@pytest.fixture
def elimination(db: sessionmaker[Session]) -> None:
    with db() as session:
        add_season(session, ELIMINATION_YEAR, ELIMINATION, run_ids={})
        session.commit()


def standings(client: TestClient, year: int) -> dict:
    response = client.get("/api/standings", params={"year": year})
    assert response.status_code == 200
    return response.json()


@pytest.mark.usefixtures("chase")
def test_chase_season(client: TestClient) -> None:
    body = standings(client, CHASE_YEAR)
    assert body["format"] == "chase"
    assert body["playoff_field"] == 2
    assert body["standings_through"] == 4
    assert [r["race_id"] for r in body["races"]] == list(CHASE)
    assert body["regular_season_champion_id"] == 2
    assert body["champion_id"] == 1

    alpha, bravo, charlie = body["drivers"]
    assert [d["name"] for d in body["drivers"]] == [
        "Alpha One (C)",
        "* Bravo Two #",
        "Charlie Three(i)",
    ]
    assert alpha["positions"] == [2, 2, 2, 1]
    assert alpha["points"] == [40, 90, 2130, 2185]
    assert alpha["in_playoffs"] == [False, False, True, True]
    assert bravo["is_rookie"] and not alpha["is_rookie"]
    assert charlie["playoff_seed"] is None
    assert charlie["car_number"] == 33


@pytest.mark.usefixtures("chase")
def test_only_the_latest_run_of_a_race_counts(client: TestClient) -> None:
    drivers = standings(client, CHASE_YEAR)["drivers"]
    # Driver 4 is only in the older run.
    assert [d["driver_id"] for d in drivers] == [1, 2, 3]
    assert (drivers[0]["positions"][-1], drivers[0]["points"][-1]) == (1, 2185)


@pytest.mark.usefixtures("chase")
def test_tied_seeds_go_to_the_better_regular_season_finish(client: TestClient) -> None:
    alpha, bravo, _ = standings(client, CHASE_YEAR)["drivers"]
    assert (bravo["playoff_seed"], bravo["playoff_start_points"]) == (1, 2100)
    assert (alpha["playoff_seed"], alpha["playoff_start_points"]) == (2, 2100)


@pytest.mark.usefixtures("elimination")
def test_elimination_season(client: TestClient) -> None:
    body = standings(client, ELIMINATION_YEAR)
    assert body["format"] == "elimination"
    assert body["playoff_field"] == 2
    assert body["regular_season_champion_id"] == 1
    assert body["champion_id"] == 2

    bravo, alpha, charlie = body["drivers"]
    assert alpha["in_playoffs"] == [False, True, False]
    assert bravo["in_playoffs"] == [False, True, True]
    assert (alpha["playoff_seed"], alpha["playoff_start_points"]) == (1, 2015)
    assert (bravo["playoff_seed"], bravo["playoff_start_points"]) == (2, 2010)
    assert charlie["playoff_seed"] is None


@pytest.mark.usefixtures("chase")
def test_standings_stop_at_the_last_race_with_standings(
    client: TestClient, db: sessionmaker[Session]
) -> None:
    with db() as session:
        session.query(PointsStanding).filter(PointsStanding.race_id == 304).delete()
        session.commit()
    body = standings(client, CHASE_YEAR)
    assert body["standings_through"] == 3
    assert body["champion_id"] is None
    assert len(body["drivers"][0]["positions"]) == 3


def test_season_without_races_is_404(client: TestClient) -> None:
    assert client.get("/api/standings", params={"year": 1990}).status_code == 404


def test_season_without_standings_falls_back_to_the_series_field(client: TestClient) -> None:
    body = standings(client, 2025)
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
