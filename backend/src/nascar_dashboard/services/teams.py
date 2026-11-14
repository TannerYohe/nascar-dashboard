"""Team listings and profiles.

The feed has no team ids, only names, so a team is every name that shares a
slug ("Stewart-Haas Racing" and "Stewart Haas Racing" are one team).
"""

from __future__ import annotations

from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Race, RaceResult
from ..schemas import (
    ChampionshipFinish,
    DriverRecord,
    MakeStarts,
    SeasonRecord,
    TeamList,
    TeamProfile,
    TeamSummary,
)
from .records import (
    best_finish,
    choose_series,
    data_since,
    fastest_lap,
    final_standings,
    group_by,
    latest,
    ranked,
    slugify,
    start_keys,
    starts_by_series,
    tally_by,
    tally_rows,
    total,
)


def list_teams(session: Session, series_id: int) -> TeamList:
    rows = tally_rows(
        session,
        series_id,
        [RaceResult.team_name, Race.race_season, RaceResult.driver_id],
        RaceResult.team_name.is_not(None),
    )
    teams = []
    for slug, team_rows in group_by(rows, lambda r: slugify(r.team_name)).items():
        if not slug:
            continue
        last = latest(team_rows)
        teams.append(
            TeamSummary(
                slug=slug,
                name=last.team_name,
                record=total(team_rows).record(),
                first_season=min(r.race_season for r in team_rows),
                last_season=last.race_season,
                drivers=len({r.driver_id for r in team_rows if r.driver_id is not None}),
            )
        )
    teams.sort(key=lambda t: (-t.record.wins, -t.record.top_10, -t.record.starts))
    return TeamList(series_id=series_id, data_since=data_since(session, series_id), teams=teams)


def _team_names(session: Session, slug: str) -> list[str]:
    names = session.scalars(
        select(RaceResult.team_name).where(RaceResult.team_name.is_not(None)).distinct()
    )
    return [name for name in names if name and slugify(name) == slug]


def _team_championships(
    session: Session, series_id: int, slug: str, drivers_by_season: dict[int, set[int]]
) -> dict[int, ChampionshipFinish]:
    """season -> the best final standing of a driver who made most of their starts for the team."""
    driver_ids = set().union(*drivers_by_season.values())
    rows = tally_rows(
        session,
        series_id,
        [Race.race_season, RaceResult.driver_id, RaceResult.team_name],
        RaceResult.driver_id.in_(driver_ids),
        Race.race_season.in_(set(drivers_by_season)),
    )
    starts: dict[tuple[int, int], Counter[str]] = {}
    for row in rows:
        if row.team_name:
            key = (row.race_season, row.driver_id)
            starts.setdefault(key, Counter())[slugify(row.team_name)] += row.starts
    finals = final_standings(session, series_id, drivers_by_season)
    out: dict[int, ChampionshipFinish] = {}
    for season, drivers in drivers_by_season.items():
        best = best_finish(
            finals[season, d]
            for d in drivers
            if (season, d) in finals and starts[season, d].most_common(1)[0][0] == slug
        )
        if best is not None:
            out[season] = best
    return out


def team_profile(session: Session, slug: str, series_id: int | None) -> TeamProfile | None:
    names = _team_names(session, slug)
    if not names:
        return None
    is_team = RaceResult.team_name.in_(names)
    starts = starts_by_series(session, is_team)
    series = choose_series(series_id, starts)
    if series is None:
        return None

    rows = tally_rows(
        session,
        series,
        [
            Race.race_season,
            RaceResult.team_name,
            RaceResult.driver_id,
            RaceResult.driver_fullname,
            RaceResult.car_make,
        ],
        is_team,
    )
    by_season = group_by(rows, lambda r: r.race_season)
    by_driver = group_by((r for r in rows if r.driver_id is not None), lambda r: r.driver_id)
    championships = _team_championships(
        session,
        series,
        slug,
        {
            season: {r.driver_id for r in season_rows if r.driver_id is not None}
            for season, season_rows in by_season.items()
        },
    )
    makes = tally_by((r for r in rows if r.car_make), lambda r: r.car_make)

    return TeamProfile(
        series_id=series,
        data_since=data_since(session, series),
        slug=slug,
        name=latest(rows).team_name,
        series_ids=sorted(starts),
        first_season=min(by_season),
        last_season=max(by_season),
        record=total(rows).record(),
        championships=[f for f in championships.values() if f.position == 1],
        best_championship=best_finish(championships.values()),
        fastest_lap=fastest_lap(session, start_keys(session, series, is_team)),
        seasons=[
            SeasonRecord(
                season=season,
                record=total(season_rows).record(),
                championship=championships.get(season),
                teams=sorted({r.team_name for r in season_rows}),
            )
            for season, season_rows in sorted(by_season.items(), reverse=True)
        ],
        drivers=[
            DriverRecord(
                driver_id=driver_id,
                name=latest(by_driver[driver_id]).driver_fullname,
                record=tally.record(),
            )
            for driver_id, tally in ranked(
                (driver_id, total(driver_rows)) for driver_id, driver_rows in by_driver.items()
            )
        ],
        makes=[
            MakeStarts(make=make, starts=tally.starts)
            for make, tally in sorted(makes.items(), key=lambda item: -item[1].starts)
        ],
    )
