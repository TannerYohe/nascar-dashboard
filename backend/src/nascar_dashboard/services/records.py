"""Results records shared by the driver, team and track pages.

Every record counts points races only. Counts are summed in the database per
group, then the groups are added together here, so one query can feed a
career total, a season-by-season table and a per-track breakdown.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Callable, Hashable, Iterable, Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import ColumnElement, Row, case, func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from ..models import PointsStanding, Race, RaceLap, RaceResult, Track
from ..schemas import ChampionshipFinish, FastLap, Record, TeamRecord
from .races import is_points_race
from .standings import latest_runs

# Finishing statuses (lowercased) that mean the car was wrecked out of the race.
CRASH_STATUSES = ("accident", "crash", "dvp")
# Anything faster is a timing glitch: no Cup lap has topped 213 mph since 1987.
MAX_PLAUSIBLE_SPEED_MPH = 215.0

# One grouped row of `tally_rows`: the group's keys, then the tally columns.
type TallyRow = Row[*tuple[Any, ...]]


@dataclass(frozen=True)
class Tally:
    """The additive counts behind a `Record`, so groups of starts can be summed."""

    starts: int = 0
    wins: int = 0
    podiums: int = 0
    top_5: int = 0
    top_10: int = 0
    poles: int = 0
    pole_wins: int = 0
    laps_led: int = 0
    laps_completed: int = 0
    races_led: int = 0
    dnfs: int = 0
    crashes: int = 0
    start_sum: int = 0
    start_count: int = 0
    finish_sum: int = 0
    deepest_win_start: int | None = None

    def __add__(self, other: Tally) -> Tally:
        deepest = [d for d in (self.deepest_win_start, other.deepest_win_start) if d is not None]
        return Tally(
            starts=self.starts + other.starts,
            wins=self.wins + other.wins,
            podiums=self.podiums + other.podiums,
            top_5=self.top_5 + other.top_5,
            top_10=self.top_10 + other.top_10,
            poles=self.poles + other.poles,
            pole_wins=self.pole_wins + other.pole_wins,
            laps_led=self.laps_led + other.laps_led,
            laps_completed=self.laps_completed + other.laps_completed,
            races_led=self.races_led + other.races_led,
            dnfs=self.dnfs + other.dnfs,
            crashes=self.crashes + other.crashes,
            start_sum=self.start_sum + other.start_sum,
            start_count=self.start_count + other.start_count,
            finish_sum=self.finish_sum + other.finish_sum,
            deepest_win_start=max(deepest, default=None),
        )

    def record(self) -> Record:
        return Record(
            starts=self.starts,
            wins=self.wins,
            podiums=self.podiums,
            top_5=self.top_5,
            top_10=self.top_10,
            poles=self.poles,
            pole_wins=self.pole_wins,
            laps_led=self.laps_led,
            laps_completed=self.laps_completed,
            races_led=self.races_led,
            dnfs=self.dnfs,
            crashes=self.crashes,
            avg_start=round(self.start_sum / self.start_count, 1) if self.start_count else None,
            avg_finish=round(self.finish_sum / self.starts, 1) if self.starts else None,
            deepest_win_start=self.deepest_win_start,
        )


def _count_where(condition: ColumnElement[bool]) -> ColumnElement[int]:
    return func.sum(case((condition, 1), else_=0))


def _tally_columns() -> tuple[ColumnElement[Any], ...]:
    finish = RaceResult.finishing_position
    start = RaceResult.starting_position
    status = func.lower(RaceResult.finishing_status)
    return (
        func.count().label("starts"),
        _count_where(finish == 1).label("wins"),
        _count_where(finish <= 3).label("podiums"),
        _count_where(finish <= 5).label("top_5"),
        _count_where(finish <= 10).label("top_10"),
        _count_where(start == 1).label("poles"),
        _count_where((start == 1) & (finish == 1)).label("pole_wins"),
        func.coalesce(func.sum(RaceResult.laps_led), 0).label("laps_led"),
        func.coalesce(func.sum(RaceResult.laps_complete), 0).label("laps_completed"),
        _count_where(RaceResult.laps_led > 0).label("races_led"),
        _count_where(status != "running").label("dnfs"),
        _count_where(status.in_(CRASH_STATUSES)).label("crashes"),
        func.coalesce(func.sum(start), 0).label("start_sum"),
        func.count(start).label("start_count"),
        func.sum(finish).label("finish_sum"),
        func.max(case((finish == 1, start))).label("deepest_win_start"),
        func.max(Race.race_date).label("last_race_date"),
    )


def _results_in(series_id: int | None) -> list[ColumnElement[bool]]:
    """Filters for counted starts: points races with a finishing position, in one series or all."""
    filters = [is_points_race(), RaceResult.finishing_position.is_not(None)]
    if series_id is not None:
        filters.append(Race.series_id == series_id)
    return filters


def tally_rows(
    session: Session,
    series_id: int,
    keys: Sequence[InstrumentedAttribute[Any]],
    *filters: ColumnElement[bool],
) -> list[TallyRow]:
    """The tally of starts in `series_id` matching `filters`, one row per distinct `keys`."""
    query = (
        select(*keys, *_tally_columns())
        .select_from(RaceResult)
        .join(Race, Race.race_id == RaceResult.race_id)
        .where(*_results_in(series_id), *filters)
        .group_by(*keys)
    )
    return list(session.execute(query).all())


def tally_of(row: TallyRow) -> Tally:
    return Tally(
        starts=row.starts,
        wins=row.wins,
        podiums=row.podiums,
        top_5=row.top_5,
        top_10=row.top_10,
        poles=row.poles,
        pole_wins=row.pole_wins,
        laps_led=row.laps_led,
        laps_completed=row.laps_completed,
        races_led=row.races_led,
        dnfs=row.dnfs,
        crashes=row.crashes,
        start_sum=row.start_sum,
        start_count=row.start_count,
        finish_sum=row.finish_sum,
        deepest_win_start=row.deepest_win_start,
    )


def total(rows: Iterable[TallyRow]) -> Tally:
    return sum((tally_of(row) for row in rows), Tally())


def tally_by[K: Hashable](rows: Iterable[TallyRow], key: Callable[[TallyRow], K]) -> dict[K, Tally]:
    """Sums the rows' tallies by `key`."""
    out: dict[K, Tally] = defaultdict(Tally)
    for row in rows:
        out[key(row)] += tally_of(row)
    return dict(out)


def group_by[K: Hashable](
    rows: Iterable[TallyRow], key: Callable[[TallyRow], K]
) -> dict[K, list[TallyRow]]:
    out: dict[K, list[TallyRow]] = defaultdict(list)
    for row in rows:
        out[key(row)].append(row)
    return dict(out)


def latest(rows: Iterable[TallyRow]) -> TallyRow:
    """The row holding the most recent race, preferring the one with the most starts."""
    return max(
        rows, key=lambda row: (row.last_race_date is not None, row.last_race_date, row.starts)
    )


def starts_by_series(session: Session, *filters: ColumnElement[bool]) -> dict[int, int]:
    """series_id -> counted starts matching `filters`."""
    rows = session.execute(
        select(Race.series_id, func.count())
        .select_from(RaceResult)
        .join(Race, Race.race_id == RaceResult.race_id)
        .where(*_results_in(None), *filters)
        .group_by(Race.series_id)
    ).all()
    return {series_id: count for series_id, count in rows}


def choose_series(requested: int | None, starts: dict[int, int]) -> int | None:
    """The requested series when there are starts in it, else the one with the most starts."""
    if requested is not None:
        return requested if requested in starts else None
    ordered = sorted(starts.items(), key=lambda item: (-item[1], item[0]))
    return ordered[0][0] if ordered else None


def fastest_lap(session: Session, series_id: int, *filters: ColumnElement[bool]) -> FastLap | None:
    """The fastest timed lap in the counted starts in `series_id` matching `filters`."""
    lap = session.execute(
        select(
            RaceLap.race_id,
            RaceLap.driver_id,
            RaceLap.lap,
            RaceLap.lap_speed,
            Race.race_name,
            Race.race_season,
            Track.track_name,
            RaceResult.driver_fullname,
        )
        .select_from(RaceLap)
        .join(
            RaceResult,
            (RaceResult.race_id == RaceLap.race_id) & (RaceResult.driver_id == RaceLap.driver_id),
        )
        .join(Race, Race.race_id == RaceLap.race_id)
        .outerjoin(Track, Track.track_id == Race.track_id)
        .where(
            *_results_in(series_id),
            *filters,
            RaceLap.lap > 0,
            RaceLap.lap_speed <= MAX_PLAUSIBLE_SPEED_MPH,
        )
        .order_by(RaceLap.lap_speed.desc())
        .limit(1)
    ).first()
    if lap is None:
        return None
    return FastLap(
        speed_mph=lap.lap_speed,
        lap=lap.lap,
        race_id=lap.race_id,
        race_name=lap.race_name,
        season=lap.race_season,
        track_name=lap.track_name,
        driver_id=lap.driver_id,
        driver_name=lap.driver_fullname,
    )


def final_standings(
    session: Session, series_id: int, seasons: Iterable[int]
) -> dict[tuple[int, int], ChampionshipFinish]:
    """(season, driver_id) -> final championship standing.

    Only seasons whose last points race has standings count, so a season still
    being run has none.
    """
    last_race: dict[int, int] = {}
    for race_id, season in session.execute(
        select(Race.race_id, Race.race_season)
        .where(Race.series_id == series_id, Race.race_season.in_(set(seasons)), is_points_race())
        .order_by(Race.race_date, Race.race_id)
    ):
        last_race[season] = race_id
    season_of = {race_id: season for season, race_id in last_race.items()}

    rows = session.scalars(
        select(PointsStanding).where(PointsStanding.race_id.in_(list(season_of)))
    ).all()
    out: dict[tuple[int, int], ChampionshipFinish] = {}
    for race_id, standings in latest_runs(list(rows)).items():
        season = season_of[race_id]
        for s in standings.values():
            if s.points_position:
                out[season, s.driver_id] = ChampionshipFinish(
                    season=season,
                    position=s.points_position,
                    driver_id=s.driver_id,
                    driver_name=" ".join(f"{s.first_name or ''} {s.last_name or ''}".split()),
                )
    return out


def best_finish(finishes: Iterable[ChampionshipFinish]) -> ChampionshipFinish | None:
    """The highest championship finish, the most recent one on a tie."""
    ordered = sorted(finishes, key=lambda f: (f.position, -f.season))
    return ordered[0] if ordered else None


def data_since(session: Session, series_id: int) -> int | None:
    """The earliest season with counted results in the series."""
    return session.scalar(
        select(func.min(Race.race_season))
        .select_from(RaceResult)
        .join(Race, Race.race_id == RaceResult.race_id)
        .where(*_results_in(series_id))
    )


def track_names(session: Session, track_ids: Iterable[int | None]) -> dict[int, str | None]:
    ids = {t for t in track_ids if t is not None}
    rows = session.execute(
        select(Track.track_id, Track.track_name).where(Track.track_id.in_(ids))
    ).all()
    return {track_id: name for track_id, name in rows}


def slugify(name: str) -> str:
    """A URL-safe key for a team name: "Joe Gibbs Racing" -> "joe-gibbs-racing"."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


class Results(Protocol):
    @property
    def wins(self) -> int: ...
    @property
    def top_10(self) -> int: ...
    @property
    def starts(self) -> int: ...


def rank_key(results: Results) -> tuple[int, int, int]:
    """Sort key for leaderboards: most wins, then most top 10s, then most starts."""
    return (-results.wins, -results.top_10, -results.starts)


def ranked[T](items: Iterable[tuple[T, Tally]]) -> list[tuple[T, Tally]]:
    return sorted(items, key=lambda item: rank_key(item[1]))


def rows_by_team(rows: Iterable[TallyRow]) -> dict[str, list[TallyRow]]:
    """Rows keyed by team name, grouped per team: every name sharing a slug."""
    return group_by(
        (r for r in rows if r.team_name and slugify(r.team_name)), lambda r: slugify(r.team_name)
    )


def team_records(rows: Iterable[TallyRow]) -> list[TeamRecord]:
    """Rows keyed by team name, summed per team."""
    by_team = rows_by_team(rows)
    return [
        TeamRecord(slug=slug, name=latest(by_team[slug]).team_name, record=tally.record())
        for slug, tally in ranked((slug, total(team_rows)) for slug, team_rows in by_team.items())
    ]
