from .base import RealBase
from .race import Race
from .car import Car
from .driver import Driver
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID


class Result(RealBase):
    __tablename__ = "Results"

    finish_position: Mapped[int]

    driver_uuid: Mapped[UUID] = mapped_column(ForeignKey("Drivers.id_uuid"))
    driver: Mapped[Driver] = relationship(back_populates="results")
    car_uuid: Mapped[UUID] = mapped_column(ForeignKey("Cars.id_uuid"))
    car: Mapped[Car] = relationship(back_populates="results")
    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="results")

    stage: Mapped["StageResult"] = relationship(back_populates="result")
    weekend_result: Mapped["WeekendResult"] = relationship(back_populates="result")
    weekend_run: Mapped["WeekendRunResult"] = relationship(back_populates="result")

    UniqueConstraint("driver_uuid", "race_uuid")
    UniqueConstraint("car_uuid", "race_uuid")
