from nascar_dashboard.services.penalties import (
    NoteText,
    OfficialInfraction,
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


def _official(car: int, lap: int) -> OfficialInfraction:
    return OfficialInfraction(
        uid=f"official-{car}-{lap}",
        car_number=car,
        driver_id=None,
        lap=lap,
        lap_assessed=lap,
        infraction="Speeding",
        penalty="Pass through",
        notes=None,
    )


def test_car_list_penalizes_every_car() -> None:
    assert _events("#1, #2 and #3 penalized for pit road speeding.") == [
        ("issued", car, "Pit road speeding", None) for car in (1, 2, 3)
    ]


def test_note_within_a_lap_of_an_official_penalty_is_not_listed_twice() -> None:
    notes = [
        NoteText(11, 1, "#5 penalized for pit road speeding."),
        NoteText(13, 1, "#5 penalized for too many crew over the wall."),
    ]
    penalties = build_penalties([_official(5, 10)], notes, [], [1] * 20, {})
    assert [(p.lap, p.source) for p in penalties] == [(10, "official"), (13, "lap_note")]


def test_pit_report_infraction_becomes_a_penalty() -> None:
    pits = [PitVisit(7, 4, "Too many men over the wall", 4)]
    [p] = build_penalties([], [], pits, [1] * 10, {7: 70})
    assert (p.source, p.car_number, p.driver_id, p.lap) == ("pit_stop", 7, 70, 4)
    assert p.infraction == "Too many crew over the wall"


def test_pit_report_infraction_already_in_a_note_is_not_listed_twice() -> None:
    notes = [NoteText(4, 1, "#7 penalized for too many men over the wall.")]
    pits = [PitVisit(7, 4, "Too many men over the wall", 4)]
    [p] = build_penalties([], notes, pits, [1] * 10, {})
    assert p.source == "lap_note"


def test_serves_note_marks_the_penalty_served() -> None:
    notes = [
        NoteText(2, 1, "#34 penalized for pit road speeding."),
        NoteText(4, 1, "#34 serves his pass-through penalty."),
    ]
    [p] = build_penalties([], notes, [PitVisit(34, 3, None, 0)], [1] * 10, {})
    assert (p.served_lap, p.served_how) == (4, "lap_note")


def test_infraction_tagged_stop_outranks_a_no_tire_stop() -> None:
    pits = [PitVisit(34, 3, None, 0), PitVisit(34, 5, "Pass through", 0)]
    notes = [NoteText(2, 1, "#34 penalized for pit road speeding")]
    given = next(p for p in build_penalties([], notes, pits, [1] * 12, {}) if p.lap == 2)
    assert (given.served_lap, given.served_how) == (5, "pit_stop")
