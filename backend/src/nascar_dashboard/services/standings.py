"""Championship standings across a season."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import PointsStanding
from ..schemas import DriverSeason, PlayoffFormat, RaceSummary, SeasonStandings
from .races import list_races

# Playoff field size by series, used until the season's first playoff race shows who is in.
DEFAULT_PLAYOFF_FIELD = {1: 16, 2: 12, 3: 10}


def playoff_format(races: list[RaceSummary]) -> PlayoffFormat:
    """Several playoff rounds means eliminations; a single round is the Chase."""
    rounds = {r.playoff_round for r in races if r.playoff_round}
    if not rounds:
        return "none"
    return "elimination" if len(rounds) > 1 else "chase"


def _latest_runs(rows: list[PointsStanding]) -> dict[int, dict[int, PointsStanding]]:
    """race_id -> driver_id -> standing, keeping only each race's latest run."""
    latest_run: dict[int, int] = {}
    for row in rows:
        latest_run[row.race_id] = max(latest_run.get(row.race_id, row.run_id), row.run_id)
    by_race: dict[int, dict[int, PointsStanding]] = defaultdict(dict)
    for row in rows:
        if row.run_id == latest_run[row.race_id] and row.is_points_eligible is not False:
            by_race[row.race_id][row.driver_id] = row
    return by_race


def _leader(standings: dict[int, PointsStanding] | None) -> int | None:
    if not standings:
        return None
    return min(standings.values(), key=lambda s: s.points_position or 10**6).driver_id


def _playoff_seeds(
    first_race: dict[int, PointsStanding], before: dict[int, PointsStanding]
) -> dict[int, tuple[int, int]]:
    """driver_id -> (seed, points after the reset), from the first playoff race's standings.

    Ties on reset points go to the better regular-season finish (`before`).
    """
    field = [s for s in first_race.values() if s.is_in_chase]
    reset = {s.driver_id: (s.points or 0) - (s.points_earned_this_race or 0) for s in field}

    def regular_season_position(driver_id: int) -> int:
        row = before.get(driver_id)
        return (row.points_position if row else None) or 10**6

    order = sorted(field, key=lambda s: (-reset[s.driver_id], regular_season_position(s.driver_id)))
    return {s.driver_id: (seed, reset[s.driver_id]) for seed, s in enumerate(order, start=1)}


def _driver(
    driver_id: int, snapshots: list[dict[int, PointsStanding]], seed: tuple[int, int] | None
) -> DriverSeason:
    rows = [s.get(driver_id) for s in snapshots]
    known = [r for r in rows if r is not None]
    last = known[-1]

    def column(attr: str) -> list:
        return [getattr(r, attr) if r is not None else None for r in rows]

    return DriverSeason(
        driver_id=driver_id,
        name=" ".join(f"{last.first_name or ''} {last.last_name or ''}".split()),
        # The latest car number the feed gave.
        car_number=next((r.car_number for r in reversed(known) if r.car_number is not None), None),
        is_rookie=any(r.is_rookie for r in known),
        positions=column("points_position"),
        points=column("points"),
        earned=column("points_earned_this_race"),
        gap_to_leader=column("delta_leader"),
        wins=column("wins"),
        top_5=column("top_5"),
        top_10=column("top_10"),
        in_playoffs=column("is_in_chase"),
        playoff_seed=seed[0] if seed else None,
        playoff_start_points=seed[1] if seed else None,
    )


def season_standings(session: Session, year: int, series_id: int) -> SeasonStandings | None:
    races = [r for r in list_races(session, year, series_id) if not r.is_exhibition]
    if not races:
        return None

    rows = session.scalars(
        select(PointsStanding).where(PointsStanding.race_id.in_([r.race_id for r in races]))
    ).all()
    by_race = _latest_runs(list(rows))
    through = max((i + 1 for i, r in enumerate(races) if r.race_id in by_race), default=0)
    snapshots = [by_race.get(r.race_id, {}) for r in races[:through]]

    first_playoff = next((i for i, r in enumerate(races) if r.playoff_round), None)
    seeds: dict[int, tuple[int, int]] = {}
    regular_season_final = (
        snapshots[first_playoff - 1] if first_playoff and first_playoff <= through else {}
    )
    if first_playoff is not None and first_playoff < through:
        seeds = _playoff_seeds(snapshots[first_playoff], regular_season_final)

    final = races[-1]
    season_over = through == len(races) and final.status == "finished"

    latest = snapshots[-1] if snapshots else {}
    seen = {driver_id for snapshot in snapshots for driver_id in snapshot}
    order = sorted(
        seen,
        key=lambda d: (latest[d].points_position or 10**6, d) if d in latest else (10**6, d),
    )
    return SeasonStandings(
        season=year,
        series_id=series_id,
        format=playoff_format(races),
        playoff_field=len(seeds) or DEFAULT_PLAYOFF_FIELD[series_id],
        races=races,
        standings_through=through,
        drivers=[_driver(d, snapshots, seeds.get(d)) for d in order],
        regular_season_champion_id=_leader(regular_season_final),
        champion_id=_leader(latest) if season_over else None,
    )
