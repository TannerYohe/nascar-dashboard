"""API response models."""

from __future__ import annotations

import datetime
from typing import Literal

from pydantic import BaseModel

RaceStatus = Literal["scheduled", "live", "finished"]


class SeriesCount(BaseModel):
    series_id: int
    race_count: int


class Season(BaseModel):
    year: int
    series: list[SeriesCount]


class Winner(BaseModel):
    driver_id: int | None
    name: str | None
    car_number: int | None


class RaceSummary(BaseModel):
    race_id: int
    series_id: int
    season: int
    race_name: str | None
    track_id: int | None
    track_name: str | None
    race_date: datetime.datetime | None
    # Points races only, numbered in date order; exhibitions have none.
    round: int | None
    is_exhibition: bool
    playoff_round: int | None
    scheduled_laps: int | None
    actual_laps: int | None
    winner: Winner | None
    has_lap_data: bool
    status: RaceStatus


class RaceDetail(RaceSummary):
    # The lap each stage ends on (cumulative), derived from the stage lengths.
    stage_ends: list[int]
    track_length_mi: float | None
    scheduled_distance: float | None
    number_of_cautions: int | None
    number_of_caution_laps: int | None
    number_of_lead_changes: int | None
    number_of_leaders: int | None
    average_speed: float | None
    margin_of_victory: str | None
    total_race_time: str | None
    television_broadcaster: str | None


class ReplayDriver(BaseModel):
    driver_id: int
    car_number: int | None
    name: str | None
    manufacturer: str | None
    team: str | None
    sponsor: str | None
    start_pos: int | None
    finish_pos: int | None
    finishing_status: str | None
    laps_led: int | None


class DriverLaps(BaseModel):
    """One driver's timing. Index i is lap i; lap 0 is the grid."""

    driver_id: int
    times: list[float | None]
    positions: list[int | None]


class Caution(BaseModel):
    start_lap: int
    end_lap: int
    flag_state: int | None
    reason: str | None
    comment: str | None
    beneficiary_car_number: int | None


class Leader(BaseModel):
    start_lap: int
    end_lap: int
    car_number: int


class PitStop(BaseModel):
    car_number: int
    driver_name: str | None
    lap: int | None
    leader_lap: int | None
    in_time: float
    out_time: float | None
    box_in_time: float | None
    box_out_time: float | None
    # Seconds stopped in the box, driving down pit road to it, and from it to
    # the exit. total_duration is entry to exit.
    stop_duration: float | None
    in_travel: float | None
    out_travel: float | None
    total_duration: float | None
    stop_type: str | None
    tires: list[Literal["LF", "RF", "LR", "RR"]]
    in_flag: int | None
    out_flag: int | None
    in_rank: int | None
    out_rank: int | None
    positions_gained: int | None
    infraction: str | None


PenaltySource = Literal["official", "lap_note", "pit_stop"]
ServedHow = Literal["lap_note", "pit_stop", "restart"]


class Penalty(BaseModel):
    id: str
    car_number: int
    driver_id: int | None
    # Leader lap the penalty was given on.
    lap: int
    infraction: str
    penalty: str | None
    detail: str | None
    source: PenaltySource
    # Leader lap it was served on, when the data shows it.
    served_lap: int | None = None
    served_how: ServedHow | None = None


NoteKind = Literal["race", "pre_race", "trivia"]


class LapNote(BaseModel):
    lap: int
    note_id: int
    flag_state: int | None
    kind: NoteKind
    note: str
    driver_ids: list[int]


class StageResult(BaseModel):
    stage: int
    driver_id: int
    car_number: int | None
    position: int | None
    points: int | None


class ReplayBundle(BaseModel):
    race: RaceDetail
    finished: bool
    # Finished, with lap times to the last lap, lap notes and pit stops all loaded.
    # A complete bundle won't change, so it can be cached for good.
    complete: bool
    drivers: list[ReplayDriver]
    laps: list[DriverLaps]
    # Flag for each lap, index = lap number (index 0 is the pre-race grid).
    lap_flags: list[int]
    cautions: list[Caution]
    leaders: list[Leader]
    pit_stops: list[PitStop]
    penalties: list[Penalty]
    notes: list[LapNote]
    stage_results: list[StageResult]
