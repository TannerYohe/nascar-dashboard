"""Championship standings endpoint."""

from __future__ import annotations

from typing import Annotated

from litestar import Router, get
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.params import FromQuery, QueryParameter
from sqlalchemy.orm import Session

from ..schemas import SeasonStandings
from ..services.standings import season_standings
from .races import LISTING_CACHE


@get("/standings", sync_to_thread=True)
def standings(
    session: NamedDependency[Session],
    year: FromQuery[int],
    series: Annotated[int, QueryParameter(ge=1, le=3)] = 1,
) -> SeasonStandings:
    result = season_standings(session, year, series)
    if result is None:
        raise NotFoundException("No races for that season and series")
    return result


router = Router("/", route_handlers=[standings], cache_control=LISTING_CACHE)
