"""The replay bundle endpoint."""

from __future__ import annotations

from collections import OrderedDict
from threading import Lock

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from ..db import get_session
from ..schemas import ReplayBundle
from ..services.replay import build_replay

router = APIRouter()

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


@router.get(
    "/races/{race_id}/replay",
    response_model=ReplayBundle,
    responses={200: {"content": {"application/json": {}}}},
)
def replay(race_id: int, session: Session = Depends(get_session)) -> Response:
    if (body := cache.get(race_id)) is not None:
        return Response(
            body, media_type="application/json", headers={"Cache-Control": COMPLETE_CACHE}
        )

    bundle = build_replay(session, race_id)
    if bundle is None:
        raise HTTPException(status_code=404, detail="Race not found")
    body = bundle.model_dump_json().encode()
    if bundle.complete:
        cache.put(race_id, body)
    return Response(
        body,
        media_type="application/json",
        headers={"Cache-Control": COMPLETE_CACHE if bundle.complete else INCOMPLETE_CACHE},
    )
