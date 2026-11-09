"""Season and race listing endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import RaceDetail, RaceSummary, Season
from ..services.races import get_race, list_races, list_seasons

router = APIRouter()

# Listings change when cadence lands a new race; a minute is plenty fresh.
LISTING_CACHE = "public, max-age=60"


@router.get("/seasons", response_model=list[Season])
def seasons(response: Response, session: Session = Depends(get_session)) -> list[Season]:
    response.headers["Cache-Control"] = LISTING_CACHE
    return list_seasons(session)


@router.get("/races", response_model=list[RaceSummary])
def races(
    response: Response,
    year: int | None = Query(default=None),
    series: int | None = Query(default=None, ge=1, le=3),
    session: Session = Depends(get_session),
) -> list[RaceSummary]:
    response.headers["Cache-Control"] = LISTING_CACHE
    return list_races(session, year, series)


@router.get("/races/{race_id}", response_model=RaceDetail)
def race(race_id: int, response: Response, session: Session = Depends(get_session)) -> RaceDetail:
    detail = get_race(session, race_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Race not found")
    response.headers["Cache-Control"] = LISTING_CACHE
    return detail
