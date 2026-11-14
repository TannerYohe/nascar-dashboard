"""Track listings and profiles."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable

from sqlalchemy import ColumnElement, select
from sqlalchemy.orm import Session

from ..models import Race, RaceResult
from ..schemas import (
    DriverRecord,
    FastestRace,
    TrackList,
    TrackProfile,
    TrackSummary,
)
from .races import is_points_race, list_races, track_length
from .records import (
    choose_series,
    data_since,
    fastest_lap,
    group_by,
    latest,
    ranked,
    start_keys,
    starts_by_series,
    tally_rows,
    team_records,
    total,
    track_names,
)


def _finished_races(session: Session, series_id: int, *filters: ColumnElement[bool]) -> list[Race]:
    """Points races in the series that have a winner, oldest first."""
    has_winner = Race.race_id.in_(
        select(RaceResult.race_id).where(RaceResult.finishing_position == 1)
    )
    return list(
        session.scalars(
            select(Race)
            .where(Race.series_id == series_id, is_points_race(), has_winner, *filters)
            .order_by(Race.race_date, Race.race_id)
        )
    )


def _average(values: Iterable[int | float | None]) -> float | None:
    known = [v for v in values if v is not None]
    return round(sum(known) / len(known), 1) if known else None


def list_tracks(session: Session, series_id: int) -> TrackList:
    races = _finished_races(session, series_id, Race.track_id.is_not(None))
    by_track: dict[int, list[Race]] = defaultdict(list)
    for race in races:
        if race.track_id is not None:
            by_track[race.track_id].append(race)
    names = track_names(session, by_track)
    tracks = [
        TrackSummary(
            track_id=track_id,
            name=names.get(track_id),
            races=len(track_races),
            first_season=track_races[0].race_season,
            last_season=track_races[-1].race_season,
            length_mi=track_length(
                track_races[-1].scheduled_distance, track_races[-1].scheduled_laps
            ),
        )
        for track_id, track_races in by_track.items()
    ]
    tracks.sort(key=lambda t: (-t.last_season, -t.races, t.name or ""))
    return TrackList(series_id=series_id, data_since=data_since(session, series_id), tracks=tracks)


def track_profile(session: Session, track_id: int, series_id: int | None) -> TrackProfile | None:
    at_track = Race.track_id == track_id
    series = choose_series(series_id, starts_by_series(session, at_track))
    races = _finished_races(session, series, at_track) if series is not None else []
    if series is None or not races:
        return None

    driver_rows = tally_rows(
        session,
        series,
        [RaceResult.driver_id, RaceResult.driver_fullname, Race.race_season],
        at_track,
        RaceResult.driver_id.is_not(None),
    )
    team_rows = tally_rows(
        session,
        series,
        [RaceResult.team_name, Race.race_season],
        at_track,
        RaceResult.team_name.is_not(None),
    )
    by_driver = group_by(driver_rows, lambda r: r.driver_id)
    fastest = max(
        (r for r in races if r.average_speed), key=lambda r: r.average_speed or 0, default=None
    )
    newest = races[-1]

    return TrackProfile(
        series_id=series,
        data_since=data_since(session, series),
        track_id=track_id,
        name=track_names(session, [track_id]).get(track_id),
        series_ids=sorted(starts_by_series(session, at_track)),
        races=len(races),
        first_season=races[0].race_season,
        last_season=newest.race_season,
        length_mi=track_length(newest.scheduled_distance, newest.scheduled_laps),
        avg_cautions=_average(r.number_of_cautions for r in races),
        avg_caution_laps=_average(r.number_of_caution_laps for r in races),
        avg_lead_changes=_average(r.number_of_lead_changes for r in races),
        avg_leaders=_average(r.number_of_leaders for r in races),
        fastest_race=FastestRace(
            race_id=fastest.race_id,
            race_name=fastest.race_name,
            season=fastest.race_season,
            average_speed=fastest.average_speed,
        )
        if fastest and fastest.average_speed
        else None,
        fastest_lap=fastest_lap(session, start_keys(session, series, at_track)),
        record=total(driver_rows).record(),
        drivers=[
            DriverRecord(
                driver_id=driver_id,
                name=latest(by_driver[driver_id]).driver_fullname,
                record=tally.record(),
            )
            for driver_id, tally in ranked((d, total(rows)) for d, rows in by_driver.items())
        ],
        teams=team_records(team_rows),
        race_list=[
            r
            for r in reversed(list_races(session, None, series, track_id))
            if not r.is_exhibition and r.status == "finished"
        ],
    )
