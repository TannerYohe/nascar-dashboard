from nascar_dashboard.services.penalties import (
    NoteText,
    PitVisit,
    build_penalties,
    note_events,
)


def _events(text: str, lap: int = 10) -> list[tuple]:
    return [
        (e.kind, e.car_number, e.infraction, e.penalty) for e in note_events(NoteText(lap, 1, text))
    ]


def _one(text: str, flags: list[int], pits: list[PitVisit] | None = None):
    [p] = build_penalties([], [NoteText(2, 1, text)], pits or [], flags, {})
    return p


def test_issued_penalty_names_the_car_before_the_keyword() -> None:
    text = (
        "#99, #45 pit.  #42 commits to pit road but goes back out, "
        "gets penalized for commitment line violation."
    )
    assert _events(text) == [("issued", 42, "Commitment line violation", None)]


def test_served_outranks_issued() -> None:
    assert _events("#23 serves his stop and go penalty, dropping to 8th.") == [
        ("served", 23, "Penalty", "Stop and go")
    ]


def test_to_the_rear_lists_reasons_per_car() -> None:
    events = _events("To the rear:  #5, #6 (backup cars), #91 (engine change)", lap=0)
    assert events == [
        ("issued", 5, "Backup car", "To the rear"),
        ("issued", 6, "Backup car", "To the rear"),
        ("issued", 91, "Engine change", "To the rear"),
    ]


def test_lap_penalty_label() -> None:
    events = _events("#5 loses a right front wheel in Turn 15, receiving a 2-lap penalty.")
    assert events == [("issued", 5, "Lost wheel", "2-lap penalty")]


def test_practice_notes_are_ignored() -> None:
    assert _events("Practice: #23 spun, 38 track limit penalties in practice", lap=0) == []


def test_penalty_under_caution_is_served_at_the_restart() -> None:
    p = _one("#34 penalized for pit road speeding", [1, 1, 2, 2, 1, 1])
    assert (p.served_lap, p.served_how) == (4, "restart")


def test_penalty_under_green_is_served_at_a_no_tire_stop() -> None:
    pits = [PitVisit(34, 2, None, 4), PitVisit(34, 4, None, 4), PitVisit(34, 5, None, 0)]
    p = _one("#34 penalized for pit road speeding", [1] * 12, pits)
    assert (p.served_lap, p.served_how) == (5, "pit_stop")


def test_unserved_penalty_stays_unserved() -> None:
    p = _one("#34 penalized for pit road speeding", [1] * 30, [PitVisit(34, 20, None, 0)])
    assert p.served_lap is None and p.served_how is None


def test_note_ids_repeated_on_different_laps_stay_separate() -> None:
    notes = [
        NoteText(10, 3, "#5 penalized for speeding on pit road."),
        NoteText(12, 7, "#5 serves his pass-through penalty."),
        NoteText(50, 3, "#5 penalized for too many crew over the wall."),
        NoteText(53, 7, "#5 serves his stop and go penalty."),
    ]
    first, second = build_penalties([], notes, [], [1] * 60, {})
    assert first.id != second.id
    assert (first.served_lap, second.served_lap) == (12, 53)
