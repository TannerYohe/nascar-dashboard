from .base import RealBase
from .race import Race
from .flag import Flag
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from uuid import UUID
from typing import Optional


class RaceHasFlag(RealBase):
    __tablename__ = "RaceHasFlags"

    elapsed_time: Mapped[float]
    comment: Mapped[Optional[str]]
    beneficiary: Mapped[Optional[str]]
    time_of_day: Mapped[float]
    time_of_day_os: Mapped[str]

    flag_uuid: Mapped[UUID] = mapped_column(ForeignKey("Flags.id_uuid"))
    flag: Mapped[Flag] = relationship()
    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="flags")
