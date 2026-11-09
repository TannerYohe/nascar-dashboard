"""Seasons and race listings."""

from __future__ import annotations

import datetime
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Race, RaceDriverLapSummary, RaceResult, Track
from ..schemas import RaceDetail, RaceStatus, RaceSummary, Season, SeriesCount, Winner
from .flags import stage_ends

EXHIBITION_RACE_TYPE = 2
# A race with no results this long after its start is treated as over anyway
# (results can lag, or never arrive for an abandoned race).
LIVE_WINDOW = datetime.timedelta(hours=8)


def list_seasons(session: Session) -> list[Season]:
    rows = session.execute(
        select(Race.race_season, Race.series_id, func.count())
        .group_by(Race.race_season, Race.series_id)
        .order_by(Race.race_season.desc(), Race.series_id)
    ).all()
    by_year: dict[int, list[SeriesCount]] = defaultdict(list)
    for year, series_id, count in rows:
        by_year[year].append(SeriesCount(series_id=series_id, race_count=count))
    return [Season(year=y, series=s) for y, s in by_year.items()]


def _status(race: Race, has_results: bool, now: datetime.datetime) -> RaceStatus:
    if has_results:
        return "finished"
    start = _aware(race.race_date)
    if start is None or start > now:
        return "scheduled"
    return "live" if now - start < LIVE_WINDOW else "finished"


def _aware(value: datetime.datetime | None) -> datetime.datetime | None:
    # SQLite hands back naive datetimes; DSQL timestamptz comes back aware.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=datetime.UTC)
    return value


def _summaries(session: Session, races: list[tuple[Race, str | None]]) -> list[RaceSummary]:
    if not races:
        return []
    ids = [r.race_id for r, _ in races]
    winners = {
        row.race_id: row
        for row in session.scalars(
            select(RaceResult).where(
                RaceResult.race_id.in_(ids), RaceResult.finishing_position == 1
            )
        )
    }
    with_laps = set(
        session.scalars(
            select(RaceDriverLapSummary.race_id)
            .where(RaceDriverLapSummary.race_id.in_(ids))
            .group_by(RaceDriverLapSummary.race_id)
        )
    )
    rounds = _round_numbers(session, {(r.race_season, r.series_id) for r, _ in races})
    now = datetime.datetime.now(datetime.UTC)

    out = []
    for race, track_name in races:
        w = winners.get(race.race_id)
        out.append(
            RaceSummary(
                race_id=race.race_id,
                series_id=race.series_id,
                season=race.race_season,
                race_name=race.race_name,
                track_id=race.track_id,
                track_name=track_name,
                race_date=_aware(race.race_date),
                round=rounds.get(race.race_id),
                is_exhibition=race.race_type_id == EXHIBITION_RACE_TYPE,
                playoff_round=race.playoff_round or None,
                scheduled_laps=race.scheduled_laps,
                actual_laps=race.actual_laps or None,
                winner=Winner(
                    driver_id=w.driver_id, name=w.driver_fullname, car_number=w.car_number
                )
                if w
                else None,
                has_lap_data=race.race_id in with_laps,
                status=_status(race, w is not None, now),
            )
        )
    return out


def _round_numbers(session: Session, seasons: set[tuple[int, int]]) -> dict[int, int]:
    """Points-race round numbers for every race in the given (season, series) pairs."""
    rows = session.execute(
        select(Race.race_id, Race.race_season, Race.series_id)
        .where(
            Race.race_season.in_({season for season, _ in seasons}),
            (Race.race_type_id != EXHIBITION_RACE_TYPE) | Race.race_type_id.is_(None),
        )
        .order_by(Race.race_date, Race.race_id)
    ).all()
    rounds: dict[int, int] = {}
    counters: dict[tuple[int, int], int] = defaultdict(int)
    for race_id, season, series_id in rows:
        if (season, series_id) in seasons:
            counters[season, series_id] += 1
            rounds[race_id] = counters[season, series_id]
    return rounds


def _base_query():
    return select(Race, Track.track_name).outerjoin(Track, Track.track_id == Race.track_id)


def list_races(session: Session, year: int | None, series_id: int | None) -> list[RaceSummary]:
    q = _base_query()
    if year is not None:
        q = q.where(Race.race_season == year)
    if series_id is not None:
        q = q.where(Race.series_id == series_id)
    q = q.order_by(Race.race_date, Race.race_id)
    rows = [(race, track_name) for race, track_name in session.execute(q).all()]
    return _summaries(session, rows)


def get_race(session: Session, race_id: int) -> RaceDetail | None:
    row = session.execute(_base_query().where(Race.race_id == race_id)).first()
    if row is None:
        return None
    race, track_name = row
    summary = _summaries(session, [(race, track_name)])[0]
    laps = race.scheduled_laps or 0
    return RaceDetail(
        **summary.model_dump(),
        stage_ends=stage_ends(
            [race.stage_1_laps, race.stage_2_laps, race.stage_3_laps, race.stage_4_laps]
        ),
        track_length_mi=round(race.scheduled_distance / laps, 4)
        if race.scheduled_distance and laps
        else None,
        scheduled_distance=race.scheduled_distance,
        number_of_cautions=race.number_of_cautions,
        number_of_caution_laps=race.number_of_caution_laps,
        number_of_lead_changes=race.number_of_lead_changes,
        number_of_leaders=race.number_of_leaders,
        average_speed=race.average_speed,
        margin_of_victory=race.margin_of_victory,
        total_race_time=race.total_race_time,
        television_broadcaster=race.television_broadcaster,
    )
