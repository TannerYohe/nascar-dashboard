from .base import RealBase
from .driver import Driver
from .car import Car
from .race import Race
from .lap import Lap
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import Optional


class Infraction(RealBase):
    __tablename__ = "Infractions"

    infraction: Mapped[str]
    notes: Mapped[str]
    penalty: Mapped[str]

    driver_uuid: Mapped[Optional[UUID]] = mapped_column(ForeignKey("Drivers.id_uuid"))
    driver: Mapped[Optional[Driver]] = relationship(back_populates="infractions")
    car_uuid: Mapped[UUID] = mapped_column(ForeignKey("Cars.id_uuid"))
    car: Mapped[Car] = relationship(back_populates="infractions")
    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="infractions")
    lap_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    lap: Mapped[Lap] = relationship(back_populates="infractions", foreign_keys=[lap_uuid])
    lap_assessed_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    lap_assessed: Mapped[Lap] = relationship(back_populates="infractions_assessed", foreign_keys=[lap_assessed_uuid])

    pitstop: Mapped["PitStop"] = relationship(back_populates="infraction")

    UniqueConstraint("lap_assessed_uuid", "driver_uuid", "infraction")
    UniqueConstraint("lap_assessed_uuid", "car_uuid", "infraction")
    UniqueConstraint("lap_uuid", "driver_uuid", "infraction")
    UniqueConstraint("lap_uuid", "car_uuid", "infraction")
