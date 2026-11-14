"""Driver listings and career profiles."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Race, RaceResult, RaceStageResult
from ..schemas import (
    DriverList,
    DriverProfile,
    DriverSummary,
    SeasonRecord,
    TrackRecord,
)
from .races import is_points_race
from .records import (
    best_finish,
    choose_series,
    data_since,
    fastest_lap,
    final_standings,
    group_by,
    latest,
    rank_key,
    ranked,
    starts_by_series,
    tally_by,
    tally_rows,
    team_records,
    total,
    track_names,
)


def list_drivers(session: Session, series_id: int) -> DriverList:
    rows = tally_rows(
        session,
        series_id,
        [RaceResult.driver_id, RaceResult.driver_fullname, RaceResult.team_name, Race.race_season],
        RaceResult.driver_id.is_not(None),
    )
    drivers = []
    for driver_id, driver_rows in group_by(rows, lambda r: r.driver_id).items():
        last = latest(driver_rows)
        drivers.append(
            DriverSummary(
                driver_id=driver_id,
                name=last.driver_fullname,
                record=total(driver_rows).record(),
                first_season=min(r.race_season for r in driver_rows),
                last_season=last.race_season,
                team=last.team_name,
            )
        )
    drivers.sort(key=lambda d: rank_key(d.record))
    return DriverList(
        series_id=series_id, data_since=data_since(session, series_id), drivers=drivers
    )


def _stage_wins(session: Session, series_id: int, driver_id: int) -> int:
    return (
        session.scalar(
            select(func.count())
            .select_from(RaceStageResult)
            .join(Race, Race.race_id == RaceStageResult.race_id)
            .where(
                Race.series_id == series_id,
                is_points_race(),
                RaceStageResult.driver_id == driver_id,
                RaceStageResult.finishing_position == 1,
            )
        )
        or 0
    )


def driver_profile(session: Session, driver_id: int, series_id: int | None) -> DriverProfile | None:
    is_driver = RaceResult.driver_id == driver_id
    starts = starts_by_series(session, is_driver)
    series = choose_series(series_id, starts)
    if series is None:
        return None

    season_rows = tally_rows(
        session,
        series,
        [Race.race_season, RaceResult.team_name, RaceResult.driver_fullname],
        is_driver,
    )
    track_rows = tally_rows(session, series, [Race.track_id], is_driver)
    by_season = group_by(season_rows, lambda r: r.race_season)
    finals = final_standings(session, series, by_season)
    mine = {season: finals.get((season, driver_id)) for season in by_season}
    names = track_names(session, (r.track_id for r in track_rows))
    last = latest(season_rows)

    return DriverProfile(
        series_id=series,
        data_since=data_since(session, series),
        driver_id=driver_id,
        name=last.driver_fullname,
        team=last.team_name,
        series_ids=sorted(starts),
        first_season=min(by_season),
        last_season=max(by_season),
        record=total(season_rows).record(),
        championships=[f for f in mine.values() if f is not None and f.position == 1],
        best_championship=best_finish(f for f in mine.values() if f is not None),
        stage_wins=_stage_wins(session, series, driver_id),
        fastest_lap=fastest_lap(session, series, is_driver),
        seasons=[
            SeasonRecord(
                season=season,
                record=total(rows).record(),
                championship=mine[season],
                teams=sorted({r.team_name for r in rows if r.team_name}),
            )
            for season, rows in sorted(by_season.items(), reverse=True)
        ],
        teams=team_records(season_rows),
        tracks=[
            TrackRecord(track_id=track_id, name=names.get(track_id), record=tally.record())
            for track_id, tally in ranked(
                tally_by(
                    (r for r in track_rows if r.track_id is not None), lambda r: r.track_id
                ).items()
            )
        ],
    )
