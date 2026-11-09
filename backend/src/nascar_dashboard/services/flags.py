"""Per-lap flag timeline."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass

# nascar_api.enums.Flag
GREEN, YELLOW, RED, WHITE, CHECKERED = 1, 2, 3, 4, 5
# Flags a lap can be run under. Lap notes also carry pre-race/cold-track states
# (8, 9) and 1000 for trivia notes; none of those describe a racing lap.
RACING_FLAGS = {GREEN, YELLOW, RED}


@dataclass(frozen=True)
class FlagNote:
    lap: int
    flag_state: int | None


@dataclass(frozen=True)
class CautionSpan:
    start_lap: int
    end_lap: int
    flag_state: int | None


def lap_flags(
    total_laps: int, notes: Iterable[FlagNote], cautions: Iterable[CautionSpan]
) -> list[int]:
    """The flag each lap was run under, index = lap number.

    Starts all green, marks laps whose notes were written under a caution, then
    applies caution segments over the top: the segments are the official record
    and win where the two disagree. Notes still matter because segments start a
    lap late. A caution that comes out mid-lap is in the notes for that lap but
    the segment starts on the next one. The final lap shows white if it was run
    green. Index 0 is the grid and is always green.
    """
    flags = [GREEN] * (total_laps + 1)
    for note in notes:
        if 1 <= note.lap <= total_laps and note.flag_state in (YELLOW, RED):
            flags[note.lap] = note.flag_state
    for span in cautions:
        state = span.flag_state if span.flag_state in RACING_FLAGS else YELLOW
        for lap in range(max(1, span.start_lap), min(total_laps, span.end_lap) + 1):
            flags[lap] = state
    if total_laps >= 1 and flags[total_laps] == GREEN:
        flags[total_laps] = WHITE
    return flags


def stage_ends(lengths: Iterable[int | None]) -> list[int]:
    """Cumulative end lap of each stage, from the race's stage lengths."""
    ends: list[int] = []
    total = 0
    for length in lengths:
        if not length:
            break
        total += length
        ends.append(total)
    return ends
