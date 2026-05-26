from .base import RealBase
from .driver import Driver
from .lap import Lap
from .car import Car
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import Optional


class DriverOnLap(RealBase):
    __tablename__ = "DriverOnLaps"

    position: Mapped[Optional[int]] = mapped_column(nullable=True)
    lap_time: Mapped[Optional[float]] = mapped_column(nullable=True)
    lap_speed: Mapped[Optional[float]] = mapped_column(nullable=True)

    driver_uuid: Mapped[UUID] = mapped_column(ForeignKey("Drivers.id_uuid"))
    driver: Mapped[Driver] = relationship(back_populates="laps")
    lap_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    lap: Mapped[Lap] = relationship(back_populates="drivers")
    car_uuid: Mapped[Optional[UUID]] = mapped_column(ForeignKey("Cars.id_uuid"), nullable=True)
    car: Mapped[Car] = relationship(back_populates="laps")

    UniqueConstraint("lap_uuid", "driver_uuid")