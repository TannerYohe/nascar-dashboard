"""The replay bundle endpoint."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock

from litestar import MediaType, Response, Router, get
from litestar.di import NamedDependency
from litestar.exceptions import NotFoundException
from litestar.openapi import ResponseSpec
from litestar.params import FromPath
from sqlalchemy.orm import Session

from ..schemas import ReplayBundle
from ..services.replay import build_replay

# A complete bundle never changes (short of a re-ingest), so it is cached by
# browsers and CDNs for a day, and in-process for the life of the worker.
COMPLETE_CACHE = "public, max-age=86400"
# Anything else (a live race, or one whose data is still loading) may change soon.
INCOMPLETE_CACHE = "public, max-age=5"
CACHE_SIZE = 24


class _BundleCache:
    """Small LRU of serialized complete bundles."""

    def __init__(self, size: int) -> None:
        self.size = size
        self._items: OrderedDict[int, bytes] = OrderedDict()
        self._lock = Lock()

    def get(self, race_id: int) -> bytes | None:
        with self._lock:
            body = self._items.get(race_id)
            if body is not None:
                self._items.move_to_end(race_id)
            return body

    def put(self, race_id: int, body: bytes) -> None:
        with self._lock:
            self._items[race_id] = body
            self._items.move_to_end(race_id)
            while len(self._items) > self.size:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


cache = _BundleCache(CACHE_SIZE)


def _json(body: bytes, cache_control: str) -> Response[bytes]:
    return Response(body, media_type=MediaType.JSON, headers={"Cache-Control": cache_control})


@get(
    "/races/{race_id:int}/replay",
    sync_to_thread=True,
    responses={200: ResponseSpec(data_container=ReplayBundle, description="The replay bundle")},
)
def replay(race_id: FromPath[int], session: NamedDependency[Session]) -> Response[bytes]:
    if (body := cache.get(race_id)) is not None:
        return _json(body, COMPLETE_CACHE)

    bundle = build_replay(session, race_id)
    if bundle is None:
        raise NotFoundException("Race not found")
    body = bundle.model_dump_json().encode()
    if bundle.complete:
        cache.put(race_id, body)
    return _json(body, COMPLETE_CACHE if bundle.complete else INCOMPLETE_CACHE)


router = Router("/", route_handlers=[replay])
