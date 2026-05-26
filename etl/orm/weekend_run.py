from datetime import datetime
from enum import unique

from .base import RealBase
from .weekend import Weekend
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from uuid import UUID
from typing import List


class WeekendRun(RealBase):
    __tablename__ = "WeekendRuns"

    nascar_run_id: Mapped[int] = mapped_column(unique=True)
    nascar_timing_id: Mapped[int] = mapped_column(unique=True)
    type: Mapped[str]
    name: Mapped[str]
    date: Mapped[datetime]
    date_utc: Mapped[datetime]

    weekend_uuid: Mapped[UUID] = mapped_column(ForeignKey("Weekends.id_uuid"))
    weekend: Mapped[Weekend] = relationship(back_populates="runs")

    results: Mapped[List["WeekendRunResult"]] = relationship(back_populates="run")
