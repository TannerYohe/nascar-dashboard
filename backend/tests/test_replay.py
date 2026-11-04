from fastapi.testclient import TestClient

from conftest import RACE_ID


def _bundle(client: TestClient, **params: int) -> dict:
    response = client.get(f"/api/races/{RACE_ID}/replay", params=params)
    assert response.status_code == 200
    return response.json()


def test_bundle_has_drivers_in_finishing_order(client: TestClient) -> None:
    body = _bundle(client)
    assert [d["car_number"] for d in body["drivers"]] == [11, 22, 33]
    assert body["drivers"][0]["manufacturer"] == "Toyota"
    assert body["drivers"][1]["manufacturer"] == "Ford"


def test_laps_are_indexed_by_lap_number(client: TestClient) -> None:
    body = _bundle(client)
    assert body["from_lap"] == 0
    laps = {d["driver_id"]: d for d in body["laps"]}
    assert laps[1]["times"][0] is None  # lap 0 is the grid
    assert laps[1]["positions"][0] == 2
    assert laps[1]["times"][1:] == [30.0, 29.0, 45.0, 50.0, 29.5, 29.0]
    assert len(laps[3]["times"]) == 4  # retired after lap 3


def test_since_lap_returns_only_newer_laps(client: TestClient) -> None:
    body = _bundle(client, since_lap=4)
    assert body["from_lap"] == 5
    laps = {d["driver_id"]: d for d in body["laps"]}
    assert laps[1]["times"] == [29.5, 29.0]
    assert 3 not in laps
    # The flag timeline still covers the whole race.
    assert len(body["lap_flags"]) == 7


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


def test_finished_bundle_is_cacheable(client: TestClient) -> None:
    first = client.get(f"/api/races/{RACE_ID}/replay")
    assert first.headers["cache-control"] == "public, max-age=86400"
    assert client.get(f"/api/races/{RACE_ID}/replay").content == first.content
