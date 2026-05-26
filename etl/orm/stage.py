from .base import RealBase
from .race import Race
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import List


class Stage(RealBase):
    __tablename__ = "Stages"

    stage_number: Mapped[int]
    laps: Mapped[int]

    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="stages")

    results: Mapped[List["StageResult"]] = relationship(back_populates="stage")

    UniqueConstraint("stage_number, race_uuid")