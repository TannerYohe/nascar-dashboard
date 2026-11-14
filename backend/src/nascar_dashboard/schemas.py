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
    # Laps the car had completed at pit-in.
    lap: int | None
    # Laps the leader had completed at pit-in.
    leader_lap: int | None
    # The lap the leader was running at pit-in, numbered like lap notes and penalties.
    note_lap: int | None
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


PlayoffFormat = Literal["none", "elimination", "chase"]


class DriverSeason(BaseModel):
    """One driver's championship standing after each race. Index i is `SeasonStandings.races[i]`.

    Every list is None from the first race the driver has no standing for.
    """

    driver_id: int
    # As the feed gives it, markers included.
    name: str
    car_number: int | None
    is_rookie: bool
    positions: list[int | None]
    points: list[int | None]
    earned: list[int | None]
    gap_to_leader: list[int | None]
    wins: list[int | None]
    top_5: list[int | None]
    top_10: list[int | None]
    in_playoffs: list[bool | None]
    # Order on points once the playoff reset is applied, before the first playoff race.
    playoff_seed: int | None
    playoff_start_points: int | None


class SeasonStandings(BaseModel):
    season: int
    series_id: int
    # "elimination" cuts the field each round; "chase" resets once.
    format: PlayoffFormat
    playoff_field: int
    # Points races in date order.
    races: list[RaceSummary]
    # How many of `races` have standings: the standings are as of races[standings_through - 1].
    standings_through: int
    # Drivers in the order of the latest standings.
    drivers: list[DriverSeason]
    regular_season_champion_id: int | None
    champion_id: int | None


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


class Record(BaseModel):
    """Results across a set of points-race starts."""

    starts: int
    wins: int
    # Top 3 finishes.
    podiums: int
    top_5: int
    top_10: int
    poles: int
    pole_wins: int
    laps_led: int
    laps_completed: int
    # Starts in which the car led at least one lap.
    races_led: int
    # Starts not running at the finish, and those ended by a crash.
    dnfs: int
    crashes: int
    avg_start: float | None
    avg_finish: float | None
    # Starting position of the win that came from furthest back.
    deepest_win_start: int | None


class FastLap(BaseModel):
    """The fastest single lap in a set of races, by average lap speed."""

    speed_mph: float
    lap: int
    race_id: int
    race_name: str | None
    season: int
    track_name: str | None
    driver_id: int
    driver_name: str | None


class ChampionshipFinish(BaseModel):
    season: int
    position: int
    driver_id: int
    driver_name: str | None


class SeasonRecord(BaseModel):
    season: int
    record: Record
    # Final standing, once the season is over: the driver's own, or the team's best driver.
    championship: ChampionshipFinish | None
    teams: list[str]


class DriverRecord(BaseModel):
    driver_id: int
    name: str | None
    record: Record


class TeamRecord(BaseModel):
    slug: str
    name: str
    record: Record


class TrackRecord(BaseModel):
    track_id: int
    name: str | None
    record: Record


class MakeStarts(BaseModel):
    make: str
    starts: int


class Coverage(BaseModel):
    series_id: int
    # The earliest season with results in the series: nothing before it is counted.
    data_since: int | None


class DriverSummary(DriverRecord):
    first_season: int
    last_season: int
    team: str | None


class DriverList(Coverage):
    drivers: list[DriverSummary]


class DriverProfile(Coverage):
    driver_id: int
    name: str | None
    # The team of the driver's most recent start.
    team: str | None
    # Every series the driver has points-race starts in.
    series_ids: list[int]
    first_season: int
    last_season: int
    record: Record
    championships: list[ChampionshipFinish]
    best_championship: ChampionshipFinish | None
    stage_wins: int
    fastest_lap: FastLap | None
    seasons: list[SeasonRecord]
    teams: list[TeamRecord]
    tracks: list[TrackRecord]


class TeamSummary(TeamRecord):
    first_season: int
    last_season: int
    drivers: int


class TeamList(Coverage):
    teams: list[TeamSummary]


class TeamProfile(Coverage):
    slug: str
    name: str
    series_ids: list[int]
    first_season: int
    last_season: int
    record: Record
    championships: list[ChampionshipFinish]
    best_championship: ChampionshipFinish | None
    fastest_lap: FastLap | None
    seasons: list[SeasonRecord]
    drivers: list[DriverRecord]
    makes: list[MakeStarts]


class RaceRef(BaseModel):
    race_id: int
    race_name: str | None
    season: int


class FastestRace(RaceRef):
    average_speed: float


class TrackSummary(BaseModel):
    track_id: int
    name: str | None
    races: int
    first_season: int
    last_season: int
    length_mi: float | None


class TrackList(Coverage):
    tracks: list[TrackSummary]


class TrackProfile(Coverage):
    track_id: int
    name: str | None
    series_ids: list[int]
    races: int
    first_season: int
    last_season: int
    length_mi: float | None
    avg_cautions: float | None
    avg_caution_laps: float | None
    avg_lead_changes: float | None
    avg_leaders: float | None
    fastest_race: FastestRace | None
    fastest_lap: FastLap | None
    # Every start at the track, all drivers together.
    record: Record
    drivers: list[DriverRecord]
    teams: list[TeamRecord]
    # Points races at the track, newest first.
    race_list: list[RaceSummary]
