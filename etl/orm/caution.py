from .base import RealBase
from .flag import Flag
from .race import Race
from .car import Car
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import Optional


class Caution(RealBase):
    __tablename__ = "Cautions"

    start_lap: Mapped[int]
    end_lap: Mapped[int]
    reason: Mapped[str]
    comment: Mapped[str]

    beneficiary_car_uuid: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("Cars.id_uuid")
    )
    beneficiary_car: Mapped[Optional[Car]] = relationship(
        back_populates="beneficiary_cautions"
    )
    flag_uuid: Mapped[UUID] = mapped_column(ForeignKey("Flags.id_uuid"))
    flag: Mapped[Flag] = relationship()
    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="cautions")

    UniqueConstraint("start_lap", "race_uuid")
    UniqueConstraint("end_lap", "race_uuid")
