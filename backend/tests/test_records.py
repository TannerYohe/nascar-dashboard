import datetime

import pytest
from litestar.testing import TestClient
from sqlalchemy.orm import Session, sessionmaker

from conftest import RACE_ID
from nascar_dashboard.models import PointsStanding, Race, RaceLap, RaceResult, Track
from nascar_dashboard.services.records import Tally, slugify

UTC = datetime.UTC

# race_id -> (track_id, date, cautions, average speed,
#             [(driver_id, team, start, finish, status, laps_led)])
# Delta runs two races for Team D, then moves to Team E for the last one. An entry with no
# driver id still counts towards the track's totals.
HISTORY = {
    500: (
        1,
        datetime.datetime(2023, 3, 1, tzinfo=UTC),
        4,
        150.0,
        [
            (1, "Team-A", 1, 3, "Running", 0),
            (2, "Team B", 5, 1, "Running", 40),
            (3, "Team C", 4, 2, "Running", 0),
            (4, "Team D", 6, 4, "Running", 0),
            (None, None, 7, 5, "Accident", 0),
        ],
    ),
    501: (
        2,
        datetime.datetime(2023, 4, 1, tzinfo=UTC),
        6,
        120.0,
        [
            (1, "Team A", 12, 1, "Running", 10),
            (2, "Team B", 2, 30, "Accident", 5),
            (3, "Team C", 3, 20, "Engine", 0),
            (4, "Team D", 6, 6, "Running", 0),
        ],
    ),
    502: (
        2,
        datetime.datetime(2023, 5, 1, tzinfo=UTC),
        3,
        110.0,
        [(4, "Team E", 1, 1, "Running", 50)],
    ),
}
NAMES = {1: "Alpha One", 2: "Bravo Two", 3: "Charlie Three", 4: "Delta Four"}
# The last race of 2023, which holds the final standings.
FINAL_2023 = 502


@pytest.fixture(autouse=True)
def history(db: sessionmaker[Session]) -> None:
    """A finished 2023 Cup season of three races, an Xfinity win for Charlie, and exhibition
    wins for Alpha that no record should count."""
    with db() as session:
        session.add(Track(track_id=2, track_name="Other Oval"))
        session.add(
            Race(
                race_id=98,
                series_id=1,
                race_season=2019,
                race_name="Exhibition",
                race_type_id=2,
                track_id=1,
                race_date=datetime.datetime(2019, 2, 1, tzinfo=UTC),
            )
        )
        for race_id in (98, 99):
            session.add(
                RaceResult(
                    race_id=race_id,
                    result_id=0,
                    driver_id=1,
                    driver_fullname=NAMES[1],
                    team_name="Team A",
                    starting_position=1,
                    finishing_position=1,
                    finishing_status="Running",
                )
            )
        for race_id, (track_id, date, cautions, speed, results) in HISTORY.items():
            session.add(
                Race(
                    race_id=race_id,
                    series_id=1,
                    race_season=2023,
                    race_name=f"Race {race_id}",
                    race_type_id=1,
                    track_id=track_id,
                    race_date=date,
                    number_of_cautions=cautions,
                    average_speed=speed,
                )
            )
            for result_id, (driver_id, team, start, finish, status, led) in enumerate(results):
                session.add(
                    RaceResult(
                        race_id=race_id,
                        result_id=result_id,
                        driver_id=driver_id,
                        driver_fullname=NAMES.get(driver_id) if driver_id else None,
                        team_name=team,
                        car_make="Chevrolet",
                        starting_position=start,
                        finishing_position=finish,
                        finishing_status=status,
                        laps_led=led,
                    )
                )
        # The 900 mph lap is a timing glitch and is ignored.
        for race_id, driver_id, lap, speed in [
            (500, 1, 1, 150.5),
            (500, 1, 2, 900.0),
            (500, 2, 1, 151.2),
            (501, 1, 1, 120.0),
        ]:
            session.add(RaceLap(race_id=race_id, driver_id=driver_id, lap=lap, lap_speed=speed))
        for driver_id, position in [(2, 1), (1, 2), (3, 3), (4, 4)]:
            session.add(
                PointsStanding(
                    race_id=FINAL_2023,
                    run_id=0,
                    driver_id=driver_id,
                    first_name=NAMES[driver_id].split()[0],
                    last_name=NAMES[driver_id].split()[1],
                    points_position=position,
                    is_points_eligible=True,
                )
            )
        session.add(
            RaceResult(
                race_id=200,
                result_id=0,
                driver_id=3,
                driver_fullname="Charlie Three",
                team_name="Team X",
                starting_position=1,
                finishing_position=1,
                finishing_status="Running",
            )
        )
        session.commit()


def get(client: TestClient, path: str, **params: int) -> dict:
    response = client.get(path, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_tally_adds_counts_and_keeps_the_deepest_win() -> None:
    total = Tally(starts=2, wins=1, deepest_win_start=4) + Tally(starts=1, wins=1)
    assert (total.starts, total.wins, total.deepest_win_start) == (3, 2, 4)
    assert Tally().record().avg_finish is None


def test_slugify() -> None:
    assert slugify("Stewart-Haas Racing") == slugify("Stewart Haas Racing") == "stewart-haas-racing"


def test_driver_list(client: TestClient) -> None:
    body = get(client, "/api/drivers", series=1)
    assert body["data_since"] == 2023
    alpha = body["drivers"][0]
    assert alpha["name"] == "Alpha One"
    assert alpha["record"]["starts"] == 3 and alpha["record"]["wins"] == 2
    assert (alpha["first_season"], alpha["last_season"], alpha["team"]) == (2023, 2025, "Team A")


def test_driver_profile(client: TestClient) -> None:
    body = get(client, "/api/drivers/1")
    record = body["record"]
    assert record["starts"] == 3
    assert (record["wins"], record["podiums"], record["poles"], record["pole_wins"]) == (2, 3, 1, 0)
    assert record["avg_start"] == 5.0 and record["avg_finish"] == 1.7
    assert record["deepest_win_start"] == 12
    assert body["fastest_lap"]["speed_mph"] == 150.5
    assert body["fastest_lap"]["race_id"] == 500
    assert body["fastest_lap"]["driver_name"] == "Alpha One"
    assert body["team"] == "Team A"
    # 2023 is over (P2); 2025 still has a race to run, so it has no final standing.
    assert body["best_championship"]["season"] == 2023
    assert body["best_championship"]["position"] == 2
    assert body["championships"] == []
    assert [(s["season"], s["championship"]) for s in body["seasons"]][0] == (2025, None)
    # "Team A" and "Team-A" are the same team.
    assert [(t["slug"], t["record"]["starts"]) for t in body["teams"]] == [("team-a", 3)]
    assert {t["track_id"]: t["record"]["starts"] for t in body["tracks"]} == {1: 2, 2: 1}


def test_driver_champion_and_crashes(client: TestClient) -> None:
    body = get(client, "/api/drivers/2")
    assert [c["season"] for c in body["championships"]] == [2023]
    assert body["record"]["crashes"] == 1 and body["record"]["dnfs"] == 1


def test_driver_defaults_to_the_series_with_most_starts(client: TestClient) -> None:
    body = get(client, "/api/drivers/3")
    assert body["series_id"] == 1 and body["series_ids"] == [1, 2]
    xfinity = get(client, "/api/drivers/3", series=2)
    assert xfinity["record"]["wins"] == 1


def test_driver_not_found(client: TestClient) -> None:
    assert client.get("/api/drivers/42").status_code == 404
    assert client.get("/api/drivers/1", params={"series": 3}).status_code == 404


def test_team_list_merges_names(client: TestClient) -> None:
    teams = {t["slug"]: t for t in get(client, "/api/teams", series=1)["teams"]}
    assert set(teams) == {"team-a", "team-b", "team-c", "team-d", "team-e"}
    assert teams["team-a"]["name"] == "Team A"
    assert teams["team-a"]["record"]["starts"] == 3
    assert teams["team-a"]["drivers"] == 1


def test_team_profile(client: TestClient) -> None:
    body = get(client, "/api/teams/team-b")
    assert body["name"] == "Team B"
    assert [c["driver_id"] for c in body["championships"]] == [2]
    assert [d["driver_id"] for d in body["drivers"]] == [2]
    assert body["makes"] == [{"make": "Chevrolet", "starts": 2}]
    assert body["fastest_lap"]["speed_mph"] == 151.2
    assert client.get("/api/teams/no-such-team").status_code == 404


def test_track_list(client: TestClient) -> None:
    tracks = {t["track_id"]: t for t in get(client, "/api/tracks", series=1)["tracks"]}
    assert tracks[1]["races"] == 2 and tracks[1]["first_season"] == 2023
    assert tracks[2]["name"] == "Other Oval"


def test_track_profile(client: TestClient) -> None:
    body = get(client, "/api/tracks/1")
    assert body["races"] == 2
    assert body["avg_cautions"] == 4.0
    assert body["fastest_race"]["race_id"] == 500
    assert body["fastest_lap"]["driver_id"] == 2
    # The entry with no driver id counts here but has no row of its own.
    assert body["record"]["starts"] == 8 and body["record"]["crashes"] == 1
    assert body["record"]["wins"] == 2
    assert [r["race_id"] for r in body["race_list"]] == [RACE_ID, 500]
    assert {d["driver_id"] for d in body["drivers"]} == {1, 2, 3, 4}
    assert {t["slug"] for t in body["teams"]} == {"team-a", "team-b", "team-c", "team-d"}


def test_track_crash_rate(client: TestClient) -> None:
    record = get(client, "/api/tracks/2")["record"]
    assert (record["crashes"], record["dnfs"]) == (1, 2)


def test_exhibitions_are_not_counted(client: TestClient) -> None:
    drivers = get(client, "/api/drivers", series=1)
    assert drivers["data_since"] == 2023
    alpha = get(client, "/api/drivers/1")
    assert alpha["record"]["wins"] == 2 and alpha["first_season"] == 2023
    assert get(client, "/api/tracks/1")["races"] == 2


def test_latest_team_comes_from_the_last_race(client: TestClient) -> None:
    # Delta made more 2023 starts for Team D but ended the season with Team E.
    drivers = {d["driver_id"]: d for d in get(client, "/api/drivers", series=1)["drivers"]}
    assert drivers[4]["team"] == "Team E"
    assert get(client, "/api/drivers/4")["team"] == "Team E"


def test_team_takes_championship_finishes_only_from_its_main_drivers(client: TestClient) -> None:
    main = get(client, "/api/teams/team-d")
    assert main["best_championship"]["driver_id"] == 4
    assert main["best_championship"]["position"] == 4
    assert main["seasons"][0]["championship"]["driver_id"] == 4

    # Team E ran Delta once, so Delta's finish isn't theirs.
    once = get(client, "/api/teams/team-e")
    assert once["best_championship"] is None
    assert once["seasons"][0]["championship"] is None
