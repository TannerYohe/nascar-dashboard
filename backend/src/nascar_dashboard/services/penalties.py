"""Penalties: when they were given and when they were served.

The official `race_infraction` rows are often empty, so penalties are also read
out of the lap notes ("#60 penalized for going through too many pit boxes",
"#23 serves his stop and go penalty", "To the rear: #38 (unapproved
adjustments)"). That parsing is a heuristic over free text. It errs toward
missing a penalty rather than inventing one.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from ..schemas import Penalty
from .flags import GREEN, WHITE

CAR = re.compile(r"#(\d{1,3})\b")
SENTENCE_END = re.compile(r"(?<=[.!?])\s+")

TO_THE_REAR = re.compile(
    r"\bto the (?:rear|tail)\b|\b(?:start|restart)s? (?:at|from) the rear\b", re.I
)
ISSUED = re.compile(
    r"penali[sz]ed|\bpenalty\b|\bviolation\b|black[- ]flag|disqualif|pass[- ]through|"
    r"stop[- ]and[- ]go|drive[- ]through|sent to the rear|too fast (?:entering|exiting|on)",
    re.I,
)
SERVED = re.compile(r"\bserv(?:e|es|ed|ing)\b", re.I)
# Penalty statements that are not about one race car on this lap.
NOT_A_PENALTY = re.compile(r"\bin practice\b|\bpractice:|\bqualifying:|track limit penalties", re.I)
# Words that join a list of cars: "#1, #2 and #3 penalized".
CAR_LIST_JOINER = re.compile(r"^(?:\s*,\s*|\s+and\s+|\s*&\s*)$", re.I)

# (pattern, label) in priority order; first match names the infraction.
INFRACTION_LABELS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p, re.I), label)
    for p, label in [
        (r"speeding|too fast", "Pit road speeding"),
        (r"too many (?:men|crew)", "Too many crew over the wall"),
        (r"too many pit boxes|pit boxes", "Too many pit boxes"),
        (r"commitment", "Commitment line violation"),
        (r"choose", "Choose rule violation"),
        (r"uncontrolled tire", "Uncontrolled tire"),
        (r"equipment", "Equipment interference"),
        (r"crew member|over the wall too soon", "Crew over the wall too soon"),
        (r"short ?cut|cutting|track limits|off track|chicane", "Track limits"),
        (r"unapproved adjustment", "Unapproved adjustments"),
        (r"backup car", "Backup car"),
        (r"engine change", "Engine change"),
        (r"inspection", "Failed inspection"),
        (r"driver change", "Driver change"),
        (
            r"pitting outside|outside the box|outside (?:of )?(?:the|his) box",
            "Pitting outside the box",
        ),
        (r"loose wheel|lug nut", "Loose wheel / lug nut"),
        (r"rough driving|retaliat|intentional", "Rough driving"),
        (r"jump(?:ed|ing)? the (?:start|restart)|restart violation", "Restart violation"),
        (r"pass(?:ing)? (?:below|before) the|out of line|early pass", "Passing violation"),
        (r"\blos(?:t|es|ing) (?:a |the |his )?(?:\w+ ){0,2}wheel|wheel came off", "Lost wheel"),
        (r"damaged vehicle|dvp|minimum speed", "Damaged vehicle policy"),
        (r"safety", "Safety violation"),
        (r"fuel", "Fueling violation"),
    ]
]
PENALTY_LABELS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(p, re.I), label)
    for p, label in [
        (r"pass[- ]through", "Pass-through"),
        (r"stop[- ]and[- ]go", "Stop and go"),
        (r"drive[- ]through", "Drive-through"),
        (r"(\d+|one|two|three)[- ]lap penalty", "{0}-lap penalty"),
        (r"black[- ]flag", "Black flag"),
        (r"disqualif", "Disqualified"),
        (r"\bheld\b|\bhold\b", "Held on pit road"),
        (TO_THE_REAR.pattern, "To the rear"),
    ]
]
SERVED_ON_PIT_ROAD = {"Pass-through", "Stop and go", "Drive-through", "Held on pit road"}
# Laps after a pit-road penalty to look for the stop that served it.
SERVE_WINDOW = 5


@dataclass(frozen=True)
class OfficialInfraction:
    uid: str
    car_number: int
    driver_id: int | None
    lap: int | None
    lap_assessed: int | None
    infraction: str | None
    penalty: str | None
    notes: str | None


@dataclass(frozen=True)
class NoteText:
    lap: int
    note_id: int
    text: str


@dataclass(frozen=True)
class PitVisit:
    car_number: int
    lap: int | None
    infraction: str | None
    tires_changed: int


@dataclass(frozen=True)
class NoteEvent:
    """One car's penalty mention in one sentence of a lap note."""

    kind: str  # "issued" | "served"
    car_number: int
    lap: int
    infraction: str
    penalty: str | None
    detail: str
    key: str = field(default="")


def _label(text: str, table: list[tuple[re.Pattern[str], str]]) -> str | None:
    for pattern, label in table:
        if m := pattern.search(text):
            return label.format(*(g.capitalize() for g in m.groups())) if m.groups() else label
    return None


def infraction_label(text: str) -> str:
    return _label(text, INFRACTION_LABELS) or "Penalty"


def penalty_label(text: str) -> str | None:
    return _label(text, PENALTY_LABELS)


def _cars_before(sentence: str, pos: int) -> list[int]:
    """The car, or comma/and-joined list of cars, written just before `pos`."""
    found = [m for m in CAR.finditer(sentence) if m.end() <= pos]
    if not found:
        return []
    cars = [found[-1]]
    for prev in reversed(found[:-1]):
        if CAR_LIST_JOINER.match(sentence[prev.end() : cars[0].start()]):
            cars.insert(0, prev)
        else:
            break
    return [int(m.group(1)) for m in cars]


def _to_the_rear(sentence: str) -> list[tuple[int, str]]:
    """`To the rear: #5, #6 (backup cars), #91 (engine change)` -> (car, reason)."""
    out: list[tuple[int, str]] = []
    pending: list[int] = []
    for token in re.finditer(r"#(\d{1,3})\b|\(([^)]*)\)?", sentence):
        if token.group(1):
            pending.append(int(token.group(1)))
        else:
            out.extend((car, token.group(2).strip()) for car in pending)
            pending = []
    out.extend((car, "") for car in pending)
    return out


def note_events(note: NoteText) -> list[NoteEvent]:
    """Penalties issued or served in a lap note, one event per car."""
    events: list[NoteEvent] = []
    for sentence in SENTENCE_END.split(note.text):
        sentence = sentence.strip()
        if not sentence or NOT_A_PENALTY.search(sentence):
            continue
        if TO_THE_REAR.search(sentence) and not SERVED.search(sentence):
            for car, reason in _to_the_rear(sentence):
                events.append(
                    NoteEvent(
                        "issued",
                        car,
                        note.lap,
                        infraction_label(reason or sentence),
                        "To the rear",
                        sentence,
                    )
                )
            continue
        served = SERVED.search(sentence)
        issued = ISSUED.search(sentence)
        if not (served or issued):
            continue
        # "Serves" outranks the penalty words it is always written with.
        kind, anchor = ("served", served) if served else ("issued", issued)
        assert anchor is not None
        cars = _cars_before(sentence, anchor.start())
        if not cars:
            after = CAR.search(sentence, anchor.end())
            cars = [int(after.group(1))] if after else []
        for car in cars:
            events.append(
                NoteEvent(
                    kind,
                    car,
                    note.lap,
                    infraction_label(sentence),
                    penalty_label(sentence),
                    sentence,
                )
            )
    return [
        NoteEvent(
            e.kind,
            e.car_number,
            e.lap,
            e.infraction,
            e.penalty,
            e.detail,
            key=f"{note.lap}:{note.note_id}:{i}",
        )
        for i, e in enumerate(events)
    ]


def _uid(*parts: object) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()[:16]


def _next_restart(lap: int, flags: Sequence[int]) -> int | None:
    """First lap after `lap` that starts a green run (the start or a restart)."""
    for i in range(max(1, lap + 1), len(flags)):
        green = flags[i] in (GREEN, WHITE)
        if green and (i == 1 or flags[i - 1] not in (GREEN, WHITE)):
            return i
    return None


def build_penalties(
    official: Iterable[OfficialInfraction],
    notes: Iterable[NoteText],
    pits: Iterable[PitVisit],
    flags: Sequence[int],
    driver_by_car: dict[int, int],
) -> list[Penalty]:
    """Merge official infractions with note-derived ones and work out when each was served."""
    penalties: list[Penalty] = []
    for o in official:
        text = " ".join(filter(None, [o.infraction, o.penalty, o.notes]))
        penalties.append(
            Penalty(
                id=o.uid,
                car_number=o.car_number,
                driver_id=o.driver_id or driver_by_car.get(o.car_number),
                lap=o.lap_assessed if o.lap_assessed is not None else (o.lap or 0),
                infraction=o.infraction or infraction_label(text),
                penalty=o.penalty or penalty_label(text),
                detail=o.notes,
                source="official",
            )
        )

    events = [e for n in sorted(notes, key=lambda n: (n.lap, n.note_id)) for e in note_events(n)]
    for e in (e for e in events if e.kind == "issued"):
        # An official row for the same car within a lap already covers it.
        if any(p.car_number == e.car_number and abs(p.lap - e.lap) <= 1 for p in penalties):
            continue
        penalties.append(
            Penalty(
                id=_uid("note", e.key, e.car_number),
                car_number=e.car_number,
                driver_id=driver_by_car.get(e.car_number),
                lap=e.lap,
                infraction=e.infraction,
                penalty=e.penalty,
                detail=e.detail,
                source="lap_note",
            )
        )

    pit_infractions = [p for p in pits if p.infraction]
    for p in pit_infractions:
        lap = p.lap or 0
        if any(x.car_number == p.car_number and abs(x.lap - lap) <= 1 for x in penalties):
            continue
        assert p.infraction is not None
        penalties.append(
            Penalty(
                id=_uid("pit", p.car_number, lap, p.infraction),
                car_number=p.car_number,
                driver_id=driver_by_car.get(p.car_number),
                lap=lap,
                infraction=infraction_label(p.infraction),
                penalty=penalty_label(p.infraction),
                detail=p.infraction,
                source="pit_stop",
            )
        )

    penalties.sort(key=lambda p: (p.lap, p.car_number))
    _match_served(penalties, [e for e in events if e.kind == "served"], list(pits), flags)
    return penalties


def _match_served(
    penalties: list[Penalty],
    served: list[NoteEvent],
    pits: list[PitVisit],
    flags: Sequence[int],
) -> None:
    used_notes: set[str] = set()
    used_pits: set[int] = set()
    for p in penalties:
        note = next(
            (
                s
                for s in served
                if s.car_number == p.car_number and s.lap >= p.lap and s.key not in used_notes
            ),
            None,
        )
        if note:
            used_notes.add(note.key)
            p.served_lap, p.served_how = note.lap, "lap_note"
            continue
        if p.penalty == "To the rear":
            _served_at_restart(p, flags)
            continue
        if p.penalty in SERVED_ON_PIT_ROAD or p.penalty is None:
            # Given under caution, a pit-road penalty is served by restarting
            # at the tail of the field. Under green it takes a trip down pit road.
            if 0 < p.lap < len(flags) and flags[p.lap] not in (GREEN, WHITE):
                _served_at_restart(p, flags)
                continue
            stop = _serving_stop(p, pits, used_pits)
            if stop is not None:
                used_pits.add(stop)
                p.served_lap, p.served_how = pits[stop].lap, "pit_stop"


def _served_at_restart(p: Penalty, flags: Sequence[int]) -> None:
    p.served_lap = _next_restart(p.lap, flags)
    p.served_how = "restart" if p.served_lap is not None else None


def _serving_stop(p: Penalty, pits: list[PitVisit], used: set[int]) -> int | None:
    """Index of the pit stop that served a pit-road penalty, if the data shows one.

    The car's next stop within SERVE_WINDOW laps that the pit report tagged with
    an infraction, or failing that one with no tires changed (a pass-through, or
    a stop-and-go). Only stops strictly after the lap it was given count:
    penalties are often given *during* a stop, which is not where they're served.
    """
    candidates = [
        i
        for i, pit in enumerate(pits)
        if i not in used
        and pit.car_number == p.car_number
        and p.lap < (pit.lap or 0) <= p.lap + SERVE_WINDOW
    ]
    tagged = next((i for i in candidates if pits[i].infraction), None)
    if tagged is not None:
        return tagged
    return next((i for i in candidates if pits[i].tires_changed == 0), None)
