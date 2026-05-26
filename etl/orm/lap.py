from .base import RealBase
from .race import Race
from .flag import Flag
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import List, Optional


class Lap(RealBase):
    __tablename__ = "Laps"

    lap_number: Mapped[int]
    note: Mapped[Optional[str]] = mapped_column(nullable=True)
    note_id: Mapped[Optional[int]] = mapped_column(nullable=True)

    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="laps")
    flag_uuid: Mapped[Optional[UUID]] = mapped_column(ForeignKey("Flags.id_uuid"), nullable=True)
    flag: Mapped[Flag] = relationship()

    pitstops: Mapped[List["PitStop"]] = relationship(back_populates="leader_lap")
    infractions: Mapped[List["Infraction"]] = relationship(back_populates="lap", foreign_keys="Infraction.lap_uuid")
    infractions_assessed: Mapped[List["Infraction"]] = relationship(
        back_populates="lap_assessed", foreign_keys="Infraction.lap_assessed_uuid"
    )
    drivers: Mapped[List["DriverOnLap"]] = relationship(back_populates="lap")

    UniqueConstraint("lap_number", "race_uuid")
