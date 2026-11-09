"""Season and race listing endpoints."""

from __future__ import annotations

from typing import Annotated

from litestar import Router, get
from litestar.datastructures import CacheControlHeader
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.params import FromPath, FromQuery, QueryParameter
from sqlalchemy.orm import Session

from ..schemas import RaceDetail, RaceSummary, Season
from ..services.races import get_race, list_races, list_seasons

# Listings change when cadence lands a new race; a minute is plenty fresh.
LISTING_CACHE = CacheControlHeader(public=True, max_age=60)


@get("/seasons", sync_to_thread=True)
def seasons(session: NamedDependency[Session]) -> list[Season]:
    return list_seasons(session)


@get("/races", sync_to_thread=True)
def races(
    session: NamedDependency[Session],
    year: FromQuery[int | None] = None,
    series: Annotated[int | None, QueryParameter(ge=1, le=3)] = None,
) -> list[RaceSummary]:
    return list_races(session, year, series)


@get("/races/{race_id:int}", sync_to_thread=True)
def race(race_id: FromPath[int], session: NamedDependency[Session]) -> RaceDetail:
    detail = get_race(session, race_id)
    if detail is None:
        raise NotFoundException("Race not found")
    return detail


router = Router("/", route_handlers=[seasons, races, race], cache_control=LISTING_CACHE)
