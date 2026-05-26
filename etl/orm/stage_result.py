from .base import RealBase
from .stage import Stage
from .result import Result
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID


class StageResult(RealBase):
    __tablename__ = "StageResults"

    stage_points: Mapped[int]

    stage_uuid: Mapped[UUID] = mapped_column(ForeignKey("Stages.id_uuid"))
    stage: Mapped[Stage] = relationship(back_populates="results")
    result_uuid: Mapped[UUID] = mapped_column(ForeignKey("Results.id_uuid"))
    result: Mapped[Result] = relationship(back_populates="stage")

    UniqueConstraint("stage_uuid", "result_uuid")
