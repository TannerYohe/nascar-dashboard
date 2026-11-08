"""An in-memory database with one small, hand-built race in it."""

from __future__ import annotations

import datetime
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from nascar_dashboard.db import get_session, sqlite_engine
from nascar_dashboard.main import app
from nascar_dashboard.models import (
    Base,
    Race,
    RaceCautionSegment,
    RaceDriverLapSummary,
    RaceInfraction,
    RaceLap,
    RaceLapNote,
    RaceLapNoteDriver,
    RaceLeader,
    RacePitStop,
    RaceResult,
    Track,
)
from nascar_dashboard.routes.replay import cache

RACE_ID = 100
UTC = datetime.UTC

# driver_id -> (car, name, maker, team, lap times for laps 1..n, start, finish)
DRIVERS = {
    1: (11, "Alpha One", "Tyt", "Team A", [30.0, 29.0, 45.0, 50.0, 29.5, 29.0], 2, 1),
    2: (22, "Bravo Two", "Frd", "Team B", [29.5, 29.4, 45.1, 50.2, 29.6, 29.2], 1, 2),
    3: (33, "Charlie Three", "Chv", "Team C", [31.0, 30.0, 46.0], 3, 3),
}


def _race(race_id: int, **kw) -> Race:
    return Race(race_id=race_id, series_id=kw.pop("series_id", 1), track_id=1, **kw)


def _populate(session: Session) -> None:
    session.add_all(
        [
            Track(track_id=1, track_name="Test Speedway"),
            _race(
                RACE_ID,
                race_season=2025,
                race_name="Test 500",
                race_type_id=1,
                race_date=datetime.datetime(2025, 3, 1, 20, tzinfo=UTC),
                scheduled_distance=9.0,
                scheduled_laps=6,
                actual_laps=6,
                stage_1_laps=2,
                stage_2_laps=2,
                stage_3_laps=2,
            ),
            _race(
                99,
                race_season=2025,
                race_name="The Clash",
                race_type_id=2,
                race_date=datetime.datetime(2025, 2, 1, 20, tzinfo=UTC),
            ),
            _race(
                101,
                race_season=2025,
                race_name="Next Race",
                race_type_id=1,
                race_date=datetime.datetime(2099, 1, 1, tzinfo=UTC),
            ),
            _race(
                200,
                series_id=2,
                race_season=2024,
                race_name="Xfinity Race",
                race_type_id=1,
                race_date=datetime.datetime(2024, 5, 1, tzinfo=UTC),
            ),
        ]
    )
    for i, (driver_id, (car, name, maker, team, times, start, finish)) in enumerate(
        DRIVERS.items()
    ):
        session.add(
            RaceDriverLapSummary(
                race_id=RACE_ID,
                driver_id=driver_id,
                car_number=car,
                full_name=name,
                manufacturer=maker,
                position=finish,
            )
        )
        session.add(
            RaceResult(
                race_id=RACE_ID,
                result_id=i,
                driver_id=driver_id,
                driver_fullname=name,
                car_number=car,
                team_name=team,
                starting_position=start,
                finishing_position=finish,
                finishing_status="Running",
            )
        )
        session.add(RaceLap(race_id=RACE_ID, driver_id=driver_id, lap=0, running_pos=start))
        for lap, t in enumerate(times, start=1):
            session.add(
                RaceLap(
                    race_id=RACE_ID, driver_id=driver_id, lap=lap, lap_time=t, running_pos=finish
                )
            )

    # `laps_done` is the car's and the leader's laps completed at pit-in (no car here is lapped).
    def stop(car: int, t_in: float, t_out: float, laps_done: int, tires: bool, **kw) -> RacePitStop:
        return RacePitStop(
            race_id=RACE_ID,
            vehicle_number=car,
            pit_in_race_time=t_in,
            pit_out_race_time=t_out,
            lap_count=laps_done,
            leader_lap=laps_done,
            left_front_tire_changed=tires,
            right_front_tire_changed=tires,
            left_rear_tire_changed=tires,
            right_rear_tire_changed=tires,
            **kw,
        )

    session.add_all(
        [
            RaceCautionSegment(
                race_id=RACE_ID,
                start_lap=4,
                end_lap=4,
                flag_state=2,
                reason="Debris",
                comment="Turn 2",
            ),
            RaceLeader(race_id=RACE_ID, start_lap=1, end_lap=6, car_number=11),
            RaceLapNote(
                race_id=RACE_ID,
                lap_number=0,
                note_id=1,
                flag_state=1,
                note="To the rear: #33 (backup car)",
            ),
            RaceLapNote(
                race_id=RACE_ID,
                lap_number=2,
                note_id=2,
                flag_state=1,
                note="#22 penalized for pit road speeding.",
            ),
            RaceLapNote(
                race_id=RACE_ID,
                lap_number=3,
                note_id=3,
                flag_state=2,
                note="Caution: #33 spins in turn 2.",
            ),
            RaceLapNoteDriver(race_id=RACE_ID, lap_number=3, note_id=3, driver_id=3),
            stop(22, 70.0, 95.0, 2, False, pit_stop_type="OTHER", pit_stop_duration=-1),
            stop(
                11, 110.0, 150.0, 3, True, pit_stop_type="FOUR_WHEEL_CHANGE", pit_stop_duration=11.2
            ),
            RaceInfraction(
                infraction_uid=uuid.uuid4(),
                race_id=RACE_ID,
                car_number=11,
                driver_id=1,
                infraction="Too many men over the wall",
                lap=3,
                lap_assessed=3,
                penalty="Tail of the field",
            ),
        ]
    )
    session.commit()


@pytest.fixture
def db() -> Iterator[sessionmaker[Session]]:
    """Session factory for the populated test database."""
    engine = sqlite_engine(None)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        _populate(session)
    try:
        yield factory
    finally:
        engine.dispose()


@pytest.fixture
def client(db: sessionmaker[Session]) -> Iterator[TestClient]:
    def _session() -> Iterator[Session]:
        with db() as session:
            yield session

    app.dependency_overrides[get_session] = _session
    cache.clear()
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
