from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session, sessionmaker

from conftest import RACE_ID
from nascar_dashboard.models import Race, RaceLap, RaceLapNote
from nascar_dashboard.routes.replay import _BundleCache

COMPLETE = "public, max-age=86400"
INCOMPLETE = "public, max-age=5"


def _bundle(client: TestClient) -> dict:
    response = client.get(f"/api/races/{RACE_ID}/replay")
    assert response.status_code == 200
    return response.json()


def test_bundle_has_drivers_in_finishing_order(client: TestClient) -> None:
    body = _bundle(client)
    assert [d["car_number"] for d in body["drivers"]] == [11, 22, 33]
    assert body["drivers"][0]["manufacturer"] == "Toyota"
    assert body["drivers"][1]["manufacturer"] == "Ford"


def test_laps_are_indexed_by_lap_number(client: TestClient) -> None:
    body = _bundle(client)
    laps = {d["driver_id"]: d for d in body["laps"]}
    assert laps[1]["times"][0] is None  # lap 0 is the grid
    assert laps[1]["positions"][0] == 2
    assert laps[1]["times"][1:] == [30.0, 29.0, 45.0, 50.0, 29.5, 29.0]
    assert len(laps[3]["times"]) == 4  # retired after lap 3


def test_flag_timeline(client: TestClient) -> None:
    # Lap 3's note was written under yellow, lap 4 is the official caution, and
    # the last lap shows white.
    assert _bundle(client)["lap_flags"] == [1, 1, 1, 2, 2, 1, 4]


def test_pit_stops(client: TestClient) -> None:
    stops = _bundle(client)["pit_stops"]
    assert [s["car_number"] for s in stops] == [22, 11]
    assert stops[0]["tires"] == [] and stops[0]["stop_duration"] is None
    assert stops[1]["tires"] == ["LF", "RF", "LR", "RR"]


def test_penalties_merge_official_and_note_sources(client: TestClient) -> None:
    penalties = {p["car_number"]: p for p in _bundle(client)["penalties"]}
    rear = penalties[33]
    assert (rear["lap"], rear["source"], rear["penalty"]) == (0, "lap_note", "To the rear")
    assert (rear["served_lap"], rear["served_how"]) == (1, "restart")

    speeding = penalties[22]
    assert speeding["infraction"] == "Pit road speeding"
    assert (speeding["served_lap"], speeding["served_how"]) == (3, "pit_stop")

    official = penalties[11]
    assert official["source"] == "official"
    assert official["infraction"] == "Too many men over the wall"


def test_notes_carry_driver_ids_and_kind(client: TestClient) -> None:
    notes = _bundle(client)["notes"]
    assert notes[0]["kind"] == "pre_race"
    spin = next(n for n in notes if n["lap"] == 3)
    assert spin["driver_ids"] == [3]


def _delete(db: sessionmaker[Session], statement) -> None:
    with db() as session:
        session.execute(statement)
        session.commit()


def test_complete_bundle_is_served_from_the_cache(
    client: TestClient, db: sessionmaker[Session]
) -> None:
    first = client.get(f"/api/races/{RACE_ID}/replay")
    assert first.json()["complete"]
    assert first.headers["cache-control"] == COMPLETE

    # With the race gone from the database, only the cache can answer.
    _delete(db, delete(Race).where(Race.race_id == RACE_ID))
    second = client.get(f"/api/races/{RACE_ID}/replay")
    assert second.status_code == 200
    assert second.content == first.content
    assert second.headers["cache-control"] == COMPLETE


def test_bundle_still_loading_notes_is_not_cached(
    client: TestClient, db: sessionmaker[Session]
) -> None:
    # Results are in, but the lap notes haven't landed yet.
    _delete(db, delete(RaceLapNote))
    first = client.get(f"/api/races/{RACE_ID}/replay")
    assert first.headers["cache-control"] == INCOMPLETE
    assert not first.json()["complete"]
    with db() as session:
        session.add(RaceLapNote(race_id=RACE_ID, lap_number=1, note_id=1, note="Green flag."))
        session.commit()
    assert [n["note"] for n in _bundle(client)["notes"]] == ["Green flag."]


def test_bundle_short_of_the_last_lap_is_not_cached(
    client: TestClient, db: sessionmaker[Session]
) -> None:
    _delete(db, delete(RaceLap).where(RaceLap.lap > 4))
    response = client.get(f"/api/races/{RACE_ID}/replay")
    assert response.headers["cache-control"] == INCOMPLETE
    assert not response.json()["complete"]


def test_bundle_cache_evicts_the_least_recently_used() -> None:
    cache = _BundleCache(2)
    cache.put(1, b"one")
    cache.put(2, b"two")
    assert cache.get(1) == b"one"  # 1 is now the most recently used
    cache.put(3, b"three")
    assert cache.get(2) is None
    assert (cache.get(1), cache.get(3)) == (b"one", b"three")
