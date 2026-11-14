"""Track listing and profile endpoints."""

from __future__ import annotations

from typing import Annotated

from litestar import Router, get
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.params import FromPath, QueryParameter
from sqlalchemy.orm import Session

from ..schemas import TrackList, TrackProfile
from ..services.tracks import list_tracks, track_profile
from .races import LISTING_CACHE


@get("/tracks", sync_to_thread=True)
def tracks(
    session: NamedDependency[Session], series: Annotated[int, QueryParameter(ge=1, le=3)] = 1
) -> TrackList:
    return list_tracks(session, series)


@get("/tracks/{track_id:int}", sync_to_thread=True)
def track(
    track_id: FromPath[int],
    session: NamedDependency[Session],
    series: Annotated[int | None, QueryParameter(ge=1, le=3)] = None,
) -> TrackProfile:
    profile = track_profile(session, track_id, series)
    if profile is None:
        raise NotFoundException("No finished points races at that track")
    return profile


router = Router("/", route_handlers=[tracks, track], cache_control=LISTING_CACHE)
