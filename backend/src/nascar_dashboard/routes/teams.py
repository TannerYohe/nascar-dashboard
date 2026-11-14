"""Team listing and profile endpoints."""

from __future__ import annotations

from typing import Annotated

from litestar import Router, get
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.params import FromPath, QueryParameter
from sqlalchemy.orm import Session

from ..schemas import TeamList, TeamProfile
from ..services.teams import list_teams, team_profile
from .races import LISTING_CACHE


@get("/teams", sync_to_thread=True)
def teams(
    session: NamedDependency[Session], series: Annotated[int, QueryParameter(ge=1, le=3)] = 1
) -> TeamList:
    return list_teams(session, series)


@get("/teams/{slug:str}", sync_to_thread=True)
def team(
    slug: FromPath[str],
    session: NamedDependency[Session],
    series: Annotated[int | None, QueryParameter(ge=1, le=3)] = None,
) -> TeamProfile:
    profile = team_profile(session, slug, series)
    if profile is None:
        raise NotFoundException("No points-race starts for that team")
    return profile


router = Router("/", route_handlers=[teams, team], cache_control=LISTING_CACHE)
