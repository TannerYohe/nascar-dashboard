"""Driver listing and profile endpoints."""

from __future__ import annotations

from typing import Annotated

from litestar import Router, get
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.params import FromPath, QueryParameter
from sqlalchemy.orm import Session

from ..schemas import DriverList, DriverProfile
from ..services.drivers import driver_profile, list_drivers
from .races import LISTING_CACHE


@get("/drivers", sync_to_thread=True)
def drivers(
    session: NamedDependency[Session], series: Annotated[int, QueryParameter(ge=1, le=3)] = 1
) -> DriverList:
    return list_drivers(session, series)


@get("/drivers/{driver_id:int}", sync_to_thread=True)
def driver(
    driver_id: FromPath[int],
    session: NamedDependency[Session],
    series: Annotated[int | None, QueryParameter(ge=1, le=3)] = None,
) -> DriverProfile:
    profile = driver_profile(session, driver_id, series)
    if profile is None:
        raise NotFoundException("No points-race starts for that driver")
    return profile


router = Router("/", route_handlers=[drivers, driver], cache_control=LISTING_CACHE)
