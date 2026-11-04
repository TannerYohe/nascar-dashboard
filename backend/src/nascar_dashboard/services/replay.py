"""Assembles everything the replay screen needs for one race in one payload."""

from __future__ import annotations

from collections import defaultdict
from typing import Literal, cast

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import (
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
)
from ..schemas import (
    Caution,
    DriverLaps,
    LapNote,
    Leader,
    NoteKind,
    Penalty,
    PitStop,
    RaceDetail,
    ReplayBundle,
    ReplayDriver,
    StageResult,
)
from .flags import CautionSpan, FlagNote, lap_flags
from .penalties import NoteText, OfficialInfraction, PitVisit, build_penalties
from .races import get_race

# The lap-times feed abbreviates; race results spell it out.
MANUFACTURERS = {"Chv": "Chevrolet", "Frd": "Ford", "Tyt": "Toyota", "Dge": "Dodge"}
# Lap-note flag states that describe a lap being raced (everything else is a
# pre-race state or 1000, which the feed uses for trivia).
RACE_NOTE_FLAGS = {1, 2, 3, 4, 5}

Tire = Literal["LF", "RF", "LR", "RR"]


def manufacturer(raw: str | None) -> str | None:
    if raw is None:
        return None
    return MANUFACTURERS.get(raw, raw)


def _drivers(session: Session, race_id: int) -> list[ReplayDriver]:
    results = {
        r.driver_id: r
        for r in session.scalars(select(RaceResult).where(RaceResult.race_id == race_id))
        if r.driver_id is not None
    }
    summaries = session.scalars(
        select(RaceDriverLapSummary).where(RaceDriverLapSummary.race_id == race_id)
    ).all()
    drivers: dict[int, ReplayDriver] = {}
    for s in summaries:
        r = results.get(s.driver_id)
        drivers[s.driver_id] = ReplayDriver(
            driver_id=s.driver_id,
            car_number=s.car_number,
            name=(r.driver_fullname if r else None) or s.full_name,
            manufacturer=manufacturer(r.car_make if r and r.car_make else s.manufacturer),
            team=r.team_name if r else None,
            sponsor=r.sponsor if r else None,
            start_pos=r.starting_position if r else None,
            finish_pos=r.finishing_position if r else s.position,
            finishing_status=r.finishing_status if r else None,
            laps_led=r.laps_led if r else None,
        )
    # Drivers with a result but no timing (a car that never took the green).
    for driver_id, r in results.items():
        if driver_id not in drivers:
            drivers[driver_id] = ReplayDriver(
                driver_id=driver_id,
                car_number=r.car_number,
                name=r.driver_fullname,
                manufacturer=manufacturer(r.car_make),
                team=r.team_name,
                sponsor=r.sponsor,
                start_pos=r.starting_position,
                finish_pos=r.finishing_position,
                finishing_status=r.finishing_status,
                laps_led=r.laps_led,
            )
    return sorted(drivers.values(), key=lambda d: (d.finish_pos is None, d.finish_pos or 0))


def _laps(session: Session, race_id: int, from_lap: int) -> tuple[list[DriverLaps], int]:
    rows = session.execute(
        select(RaceLap.driver_id, RaceLap.lap, RaceLap.lap_time, RaceLap.running_pos)
        .where(RaceLap.race_id == race_id, RaceLap.lap >= from_lap)
        .order_by(RaceLap.driver_id, RaceLap.lap)
    ).all()
    by_driver: dict[int, list[tuple[int, float | None, int | None]]] = defaultdict(list)
    max_lap = 0
    for driver_id, lap, lap_time, pos in rows:
        by_driver[driver_id].append((lap, lap_time, pos))
        max_lap = max(max_lap, lap)
    out = []
    for driver_id, laps in by_driver.items():
        length = laps[-1][0] - from_lap + 1
        times: list[float | None] = [None] * length
        positions: list[int | None] = [None] * length
        for lap, lap_time, pos in laps:
            times[lap - from_lap] = lap_time
            positions[lap - from_lap] = pos
        out.append(DriverLaps(driver_id=driver_id, times=times, positions=positions))
    return out, max_lap


def _max_lap(session: Session, race_id: int) -> int:
    return session.scalar(select(func.max(RaceLap.lap)).where(RaceLap.race_id == race_id)) or 0


def _notes(session: Session, race_id: int) -> list[LapNote]:
    drivers: dict[tuple[int, int], list[int]] = defaultdict(list)
    for lap, note_id, driver_id in session.execute(
        select(
            RaceLapNoteDriver.lap_number, RaceLapNoteDriver.note_id, RaceLapNoteDriver.driver_id
        ).where(RaceLapNoteDriver.race_id == race_id)
    ):
        drivers[lap, note_id].append(driver_id)
    notes = []
    for n in session.scalars(
        select(RaceLapNote)
        .where(RaceLapNote.race_id == race_id)
        .order_by(RaceLapNote.lap_number, RaceLapNote.note_id)
    ):
        kind: NoteKind = (
            "pre_race"
            if n.lap_number == 0
            else "race"
            if n.flag_state in RACE_NOTE_FLAGS
            else "trivia"
        )
        notes.append(
            LapNote(
                lap=n.lap_number,
                note_id=n.note_id,
                flag_state=n.flag_state,
                kind=kind,
                note=n.note or "",
                driver_ids=drivers.get((n.lap_number, n.note_id), []),
            )
        )
    return notes


def _pit_stops(session: Session, race_id: int) -> list[PitStop]:
    stops = []
    for p in session.scalars(
        select(RacePitStop)
        .where(RacePitStop.race_id == race_id)
        .order_by(RacePitStop.pit_in_race_time)
    ):
        changed = [
            ("LF", p.left_front_tire_changed),
            ("RF", p.right_front_tire_changed),
            ("LR", p.left_rear_tire_changed),
            ("RR", p.right_rear_tire_changed),
        ]
        stops.append(
            PitStop(
                car_number=p.vehicle_number,
                driver_name=p.driver_name,
                lap=p.lap_count,
                leader_lap=p.leader_lap,
                in_time=p.pit_in_race_time,
                out_time=p.pit_out_race_time,
                # The feed uses -1 for "not measured".
                box_in_time=_measured(p.box_stop_race_time),
                box_out_time=_measured(p.box_leave_race_time),
                stop_duration=_measured(p.pit_stop_duration),
                total_duration=_measured(p.total_duration),
                stop_type=p.pit_stop_type,
                tires=[cast(Tire, name) for name, on in changed if on],
                in_flag=p.pit_in_flag_status,
                out_flag=p.pit_out_flag_status,
                in_rank=p.pit_in_rank or None,
                out_rank=p.pit_out_rank or None,
                positions_gained=p.positions_gained_lost,
                infraction=p.infraction or None,
            )
        )
    return stops


def _measured(value: float | None) -> float | None:
    return None if value is None or value < 0 else value


def build_replay(
    session: Session, race_id: int, since_lap: int | None = None
) -> ReplayBundle | None:
    race: RaceDetail | None = get_race(session, race_id)
    if race is None:
        return None
    from_lap = 0 if since_lap is None else since_lap + 1

    drivers = _drivers(session, race_id)
    laps, max_lap = _laps(session, race_id, from_lap)
    if since_lap is not None:
        max_lap = max(max_lap, _max_lap(session, race_id))
    total_laps = max(race.actual_laps or 0, max_lap)

    cautions = [
        Caution(
            start_lap=c.start_lap,
            end_lap=c.end_lap,
            flag_state=c.flag_state,
            reason=c.reason,
            comment=c.comment,
            beneficiary_car_number=c.beneficiary_car_number,
        )
        for c in session.scalars(
            select(RaceCautionSegment)
            .where(RaceCautionSegment.race_id == race_id)
            .order_by(RaceCautionSegment.start_lap)
        )
    ]
    notes = _notes(session, race_id)
    flags = lap_flags(
        total_laps,
        [FlagNote(n.lap, n.flag_state) for n in notes if n.kind == "race"],
        [CautionSpan(c.start_lap, c.end_lap, c.flag_state) for c in cautions],
    )
    pit_stops = _pit_stops(session, race_id)

    driver_by_car = {d.car_number: d.driver_id for d in drivers if d.car_number is not None}
    official = [
        OfficialInfraction(
            uid=str(i.infraction_uid),
            car_number=i.car_number,
            driver_id=i.driver_id,
            lap=i.lap,
            lap_assessed=i.lap_assessed,
            infraction=i.infraction,
            penalty=i.penalty,
            notes=i.notes,
        )
        for i in session.scalars(select(RaceInfraction).where(RaceInfraction.race_id == race_id))
        if i.car_number is not None
    ]
    penalties = build_penalties(
        official,
        [NoteText(n.lap, n.note_id, n.note) for n in notes if n.kind != "trivia"],
        [
            PitVisit(p.car_number, p.lap, p.infraction, len(p.tires))
            for p in pit_stops
            if p.in_time > 0
        ],
        flags,
        driver_by_car,
    )

    return ReplayBundle(
        race=race,
        finished=race.status == "finished",
        from_lap=from_lap,
        drivers=drivers,
        laps=laps,
        lap_flags=flags,
        cautions=cautions,
        leaders=[
            Leader(start_lap=r.start_lap, end_lap=r.end_lap, car_number=r.car_number)
            for r in session.scalars(
                select(RaceLeader)
                .where(RaceLeader.race_id == race_id)
                .order_by(RaceLeader.start_lap)
            )
        ],
        pit_stops=pit_stops,
        penalties=[Penalty(**vars(p)) for p in penalties],
        notes=notes,
        stage_results=[
            StageResult(
                stage=s.stage_number,
                driver_id=s.driver_id,
                car_number=s.car_number,
                position=s.finishing_position,
                points=s.stage_points,
            )
            for s in session.scalars(
                select(RaceStageResult)
                .where(RaceStageResult.race_id == race_id)
                .order_by(RaceStageResult.stage_number, RaceStageResult.finishing_position)
            )
        ],
    )
