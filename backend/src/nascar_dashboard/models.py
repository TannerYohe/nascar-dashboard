"""Read-only models for the `nascar` schema.

The schema is owned by the cadence repo (cadence/src/cadence/db/models), which
creates and writes it. These mirror only the tables and columns the dashboard
reads. Keep them in step with cadence when it changes a table.

Every non-key column is declared nullable. The dashboard never writes, so this
costs nothing, and it keeps test fixtures down to the columns a test cares about.
"""

from __future__ import annotations

import datetime
import uuid

from sqlalchemy import DateTime, Double, MetaData, SmallInteger, Text, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "nascar"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)
    type_annotation_map = {
        str: Text,
        float: Double,
        datetime.datetime: DateTime(timezone=True),
    }


class Track(Base):
    __tablename__ = "track"

    track_id: Mapped[int] = mapped_column(primary_key=True)
    track_name: Mapped[str | None]


class Race(Base):
    __tablename__ = "race"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    series_id: Mapped[int] = mapped_column(SmallInteger)
    race_season: Mapped[int]
    race_name: Mapped[str | None]
    # 1 points race, 2 exhibition (Clash, Duels, All-Star).
    race_type_id: Mapped[int | None]
    restrictor_plate: Mapped[bool | None]
    track_id: Mapped[int | None]
    # US/Eastern wall-clock in the feed, stored as timestamptz by cadence.
    race_date: Mapped[datetime.datetime | None]
    scheduled_distance: Mapped[float | None]
    actual_distance: Mapped[float | None]
    scheduled_laps: Mapped[int | None]
    actual_laps: Mapped[int | None]
    # Stage *lengths*, not the lap each stage ends on.
    stage_1_laps: Mapped[int | None]
    stage_2_laps: Mapped[int | None]
    stage_3_laps: Mapped[int | None]
    stage_4_laps: Mapped[int | None]
    number_of_cars_in_field: Mapped[int | None]
    number_of_lead_changes: Mapped[int | None]
    number_of_leaders: Mapped[int | None]
    number_of_cautions: Mapped[int | None]
    number_of_caution_laps: Mapped[int | None]
    average_speed: Mapped[float | None]
    total_race_time: Mapped[str | None]
    margin_of_victory: Mapped[str | None]
    television_broadcaster: Mapped[str | None]
    playoff_round: Mapped[int | None]
    winner_driver_id: Mapped[int | None]


class RaceResult(Base):
    __tablename__ = "race_result"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    result_id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int | None]
    driver_fullname: Mapped[str | None]
    car_make: Mapped[str | None]
    car_number: Mapped[int | None]
    team_name: Mapped[str | None]
    sponsor: Mapped[str | None]
    starting_position: Mapped[int | None]
    finishing_position: Mapped[int | None]
    finishing_status: Mapped[str | None]
    laps_complete: Mapped[int | None]
    laps_led: Mapped[int | None]
    points_earned: Mapped[int | None]


class RaceDriverLapSummary(Base):
    __tablename__ = "race_driver_lap_summary"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(primary_key=True)
    car_number: Mapped[int | None]
    full_name: Mapped[str | None]
    manufacturer: Mapped[str | None]
    position: Mapped[int | None]


class RaceLap(Base):
    __tablename__ = "race_lap"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(primary_key=True)
    # Lap 0 is the starting grid: no time, running_pos is the starting spot.
    lap: Mapped[int] = mapped_column(primary_key=True)
    lap_time: Mapped[float | None]
    lap_speed: Mapped[float | None]
    running_pos: Mapped[int | None]


class RaceLapNote(Base):
    __tablename__ = "race_lap_note"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    lap_number: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(primary_key=True)
    flag_state: Mapped[int | None] = mapped_column(SmallInteger)
    note: Mapped[str | None]


class RaceLapNoteDriver(Base):
    __tablename__ = "race_lap_note_driver"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    lap_number: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(primary_key=True)


class RaceCautionSegment(Base):
    __tablename__ = "race_caution_segment"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    start_lap: Mapped[int] = mapped_column(primary_key=True)
    end_lap: Mapped[int] = mapped_column(primary_key=True)
    reason: Mapped[str | None]
    comment: Mapped[str | None]
    beneficiary_car_number: Mapped[int | None]
    flag_state: Mapped[int | None] = mapped_column(SmallInteger)


class RaceLeader(Base):
    __tablename__ = "race_leader"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    start_lap: Mapped[int] = mapped_column(primary_key=True)
    end_lap: Mapped[int] = mapped_column(primary_key=True)
    car_number: Mapped[int] = mapped_column(primary_key=True)


class RacePitStop(Base):
    __tablename__ = "race_pit_stop"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_number: Mapped[int] = mapped_column(primary_key=True)
    # Seconds since the green flag, on the same clock as summed lap times.
    pit_in_race_time: Mapped[float] = mapped_column(primary_key=True)
    driver_name: Mapped[str | None]
    leader_lap: Mapped[int | None]
    lap_count: Mapped[int | None]
    pit_in_flag_status: Mapped[int | None] = mapped_column(SmallInteger)
    pit_out_flag_status: Mapped[int | None] = mapped_column(SmallInteger)
    pit_out_race_time: Mapped[float | None]
    total_duration: Mapped[float | None]
    box_stop_race_time: Mapped[float | None]
    box_leave_race_time: Mapped[float | None]
    pit_stop_duration: Mapped[float | None]
    in_travel_duration: Mapped[float | None]
    out_travel_duration: Mapped[float | None]
    pit_stop_type: Mapped[str | None]
    left_front_tire_changed: Mapped[bool | None]
    right_front_tire_changed: Mapped[bool | None]
    left_rear_tire_changed: Mapped[bool | None]
    right_rear_tire_changed: Mapped[bool | None]
    pit_in_rank: Mapped[int | None]
    pit_out_rank: Mapped[int | None]
    positions_gained_lost: Mapped[int | None]
    infraction: Mapped[str | None]


class RaceInfraction(Base):
    __tablename__ = "race_infraction"

    infraction_uid: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    race_id: Mapped[int]
    car_number: Mapped[int | None]
    driver_fullname: Mapped[str | None]
    driver_id: Mapped[int | None]
    infraction: Mapped[str | None]
    lap: Mapped[int | None]
    lap_assessed: Mapped[int | None]
    notes: Mapped[str | None]
    penalty: Mapped[str | None]


class PointsStanding(Base):
    """Championship standings as they stood after a race."""

    __tablename__ = "points_standing"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(primary_key=True)
    # The feed marks names with "(P)"/"(C)" for playoff drivers, "#" for rookies and so on.
    first_name: Mapped[str | None]
    last_name: Mapped[str | None]
    car_number: Mapped[int | None]
    points: Mapped[int | None]
    points_position: Mapped[int | None]
    points_earned_this_race: Mapped[int | None]
    delta_leader: Mapped[int | None]
    wins: Mapped[int | None]
    top_5: Mapped[int | None]
    top_10: Mapped[int | None]
    is_in_chase: Mapped[bool | None]
    is_points_eligible: Mapped[bool | None]
    is_rookie: Mapped[bool | None]


class RaceStageResult(Base):
    __tablename__ = "race_stage_result"

    race_id: Mapped[int] = mapped_column(primary_key=True)
    stage_number: Mapped[int] = mapped_column(primary_key=True)
    driver_id: Mapped[int] = mapped_column(primary_key=True)
    driver_fullname: Mapped[str | None]
    car_number: Mapped[int | None]
    finishing_position: Mapped[int | None]
    stage_points: Mapped[int | None]
