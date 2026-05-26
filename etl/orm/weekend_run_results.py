from .base import RealBase
from .result import Result
from .weekend_run import WeekendRun
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID


class WeekendRunResult(RealBase):
    __tablename__ = "WeekendRunResults"

    best_lap_time: Mapped[float]
    best_lap_speed: Mapped[float]
    best_lap_number: Mapped[int]
    laps_completed: Mapped[int]
    comment: Mapped[str]
    delta_leader: Mapped[float]
    disqualified: Mapped[bool]

    run_uuid: Mapped[UUID] = mapped_column(ForeignKey("WeekendRuns.id_uuid"))
    run: Mapped[WeekendRun] = relationship(back_populates="results")
    result_uuid: Mapped[UUID] = mapped_column(ForeignKey("Results.id_uuid"))
    result: Mapped[Result] = relationship(back_populates="weekend_run")

    UniqueConstraint("run_uuid", "result_uuid")
