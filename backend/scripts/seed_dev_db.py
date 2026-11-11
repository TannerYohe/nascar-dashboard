"""Load races from the public NASCAR feed into a local SQLite file.

For running the dashboard without DSQL. It mirrors what cadence writes, using
the same nascar-api library, but only the tables the dashboard reads.

    uv run --group seed python scripts/seed_dev_db.py --db dev.db --year 2025 --latest 5
    uv run --group seed python scripts/seed_dev_db.py --db dev.db --year 2025 --race 5551

It also loads the standings after every finished race in the season.

Then start the API with DATABASE_URL=sqlite:///dev.db.
"""

from __future__ import annotations

import argparse
import datetime
import logging
import uuid
from collections.abc import Iterable
from typing import Any
from zoneinfo import ZoneInfo

from nascar_api.enums import Series
from nascar_api.models import LapData, RaceInfo
from nascar_api.repos import HistoricNascarRepo, LiveNascarFeedRepo
from pydantic import BaseModel
from requests import HTTPError
from sqlalchemy import delete
from sqlalchemy.orm import Session

from nascar_dashboard.db import sqlite_engine
from nascar_dashboard.models import (
    Base,
    PointsStanding,
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
    RaceStageResult,
    Track,
)

log = logging.getLogger("seed")
EASTERN = ZoneInfo("America/New_York")
KNOWN_FLAGS = {1, 2, 3, 4, 5, 8, 9}
REPO = HistoricNascarRepo()
LIVE = LiveNascarFeedRepo()


def _row(payload: BaseModel, model: type[Base], **extra: Any) -> dict[str, Any]:
    columns = model.__table__.columns.keys()
    row = {k: v for k, v in payload.model_dump().items() if k in columns}
    row.update(extra)
    return {k: int(v) if hasattr(v, "value") and isinstance(v, int) else v for k, v in row.items()}


def _eastern(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=EASTERN).astimezone(datetime.UTC)


def _replace(session: Session, model: type[Base], race_id: int, rows: Iterable[dict]) -> None:
    session.execute(delete(model).where(model.race_id == race_id))  # type: ignore[attr-defined]
    seen: set[tuple] = set()
    keys = [c.name for c in model.__table__.primary_key.columns]
    for row in rows:
        key = tuple(row.get(k) for k in keys)
        if key in seen:
            continue
        seen.add(key)
        session.add(model(**row))


def _lap_notes(year: int, series: Series, race_id: int) -> list[LapData]:
    # Same filtering as cadence's get_lap_notes: drop the FlagState 1000 trivia.
    payload = REPO.safe_get(f"{REPO.DOMAIN}/{year}/{series.value}/{race_id}/lap-notes.json")
    return [
        LapData(
            race_id=race_id,
            lap_number=int(lap),
            flag_state=entry["FlagState"],
            note=entry.get("Note"),
            note_id=entry.get("NoteID"),
            driver_ids=[d for d in entry.get("DriverIDs") or [] if d],
        )
        for lap, entries in payload["laps"].items()
        for entry in entries
        if entry.get("FlagState") in KNOWN_FLAGS
    ]


def _try(what: str, fn):  # noqa: ANN001, ANN202
    try:
        return fn()
    except HTTPError as err:
        log.warning("  %s unavailable (%s)", what, err.response.status_code)
    except Exception as err:  # noqa: BLE001 - one missing feed should not stop the seed
        log.warning("  %s failed: %s", what, err)
    return None


def seed_race(session: Session, race: RaceInfo) -> None:
    year, series, race_id = race.race_season, Series(race.series_id), race.race_id
    log.info("Race %s: %s %s", race_id, year, race.race_name)

    if weekend := _try("weekend feed", lambda: REPO.get_weekend_data(year, series, race_id)):
        w = weekend.weekend_race[0] if weekend.weekend_race else None
        if w:
            _replace(session, RaceResult, race_id, [_row(r, RaceResult) for r in w.results])
            _replace(
                session,
                RaceCautionSegment,
                race_id,
                [_row(c, RaceCautionSegment) for c in w.caution_segments],
            )
            _replace(session, RaceLeader, race_id, [_row(r, RaceLeader) for r in w.race_leaders])
            _replace(
                session,
                RaceStageResult,
                race_id,
                [
                    _row(r, RaceStageResult, race_id=race_id, stage_number=s.stage_number)
                    for s in w.stage_results
                    for r in s.results
                ],
            )

    if laps := _try("lap times", lambda: REPO.get_lap_times(year, series, race_id)):
        summary = [_row(d, RaceDriverLapSummary, car_number=d.number) for d in laps]
        _replace(session, RaceDriverLapSummary, race_id, summary)
        _replace(
            session,
            RaceLap,
            race_id,
            [
                _row(lap, RaceLap, race_id=race_id, driver_id=d.driver_id)
                for d in laps
                for lap in d.laps
            ],
        )

    if notes := _try("lap notes", lambda: _lap_notes(year, series, race_id)):
        _replace(session, RaceLapNote, race_id, [_row(n, RaceLapNote) for n in notes])
        _replace(
            session,
            RaceLapNoteDriver,
            race_id,
            [
                {
                    "race_id": race_id,
                    "lap_number": n.lap_number,
                    "note_id": n.note_id,
                    "driver_id": d,
                }
                for n in notes
                for d in n.driver_ids
            ],
        )

    if pits := _try("pit data", lambda: REPO.get_pit_data(series, race_id)):
        _replace(
            session, RacePitStop, race_id, [_row(p, RacePitStop, race_id=race_id) for p in pits]
        )


def seed_standings(session: Session, race: RaceInfo) -> None:
    series, race_id = Series(race.series_id), race.race_id
    if points := _try("standings", lambda: LIVE.get_live_points(series, race_id)):
        # The feed leaves race_id and run_id at 0, so the race comes from the URL (as in cadence).
        _replace(
            session,
            PointsStanding,
            race_id,
            [_row(p, PointsStanding, race_id=race_id, run_id=0) for p in points],
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--db", default="dev.db")
    parser.add_argument("--year", type=int, default=datetime.date.today().year)
    parser.add_argument("--series", type=int, action="append", choices=[1, 2, 3])
    parser.add_argument("--race", type=int, action="append", help="race_id(s) to load in full")
    parser.add_argument(
        "--latest", type=int, default=0, help="load the N most recent finished races"
    )
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    engine = sqlite_engine(args.db)
    Base.metadata.create_all(engine)
    series = [Series(s) for s in (args.series or [1, 2, 3])]

    with Session(engine) as session:
        races: list[RaceInfo] = [r for s in series for r in REPO.get_races(args.year, s)]
        log.info("Loaded %d race headers for %d", len(races), args.year)
        for track_id, name in {(r.track_id, r.track_name) for r in races}:
            session.merge(Track(track_id=track_id, track_name=name))
        for r in races:
            row = _row(r, Race)
            row["race_date"] = _eastern(r.race_date)
            session.merge(Race(**row))
            for i, inf in enumerate(r.infractions or []):
                uid = uuid.uuid5(uuid.NAMESPACE_OID, f"{r.race_id}|{inf.car_number}|{inf.lap}|{i}")
                session.merge(
                    RaceInfraction(
                        **_row(inf, RaceInfraction, race_id=r.race_id, infraction_uid=uid)
                    )
                )
        session.commit()

        now = datetime.datetime.now(datetime.UTC)
        finished = sorted(
            (r for r in races if r.actual_laps and _eastern(r.race_date) < now),
            key=lambda r: r.race_date,
        )
        targets = {r.race_id: r for r in finished[-args.latest :]} if args.latest else {}
        by_id = {r.race_id: r for r in races}
        for race_id in args.race or []:
            if race_id in by_id:
                targets[race_id] = by_id[race_id]
            else:
                log.warning("Race %s is not in the %d schedule", race_id, args.year)
        for race in targets.values():
            seed_race(session, race)
            session.commit()

        log.info("Loading standings for %d finished races", len(finished))
        for race in finished:
            seed_standings(session, race)
        session.commit()


if __name__ == "__main__":
    main()
