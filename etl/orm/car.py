from .base import RealBase
from sqlalchemy.orm import Mapped, relationship, mapped_column
from sqlalchemy import UniqueConstraint
from typing import List, Optional


class Car(RealBase):
    __tablename__ = "Cars"

    manufacturer: Mapped[str]
    number: Mapped[int]
    model: Mapped[Optional[str]] = mapped_column(nullable=True)

    beneficiary_cautions: Mapped[List["Caution"]] = relationship(
        back_populates="beneficiary_car"
    )
    infractions: Mapped[List["Infraction"]] = relationship(back_populates="car")
    pitstops: Mapped[List["PitStop"]] = relationship(back_populates="car")
    lead_segments: Mapped[List["LeadSegment"]] = relationship(back_populates="car")
    laps: Mapped[List["DriverOnLap"]] = relationship(back_populates="car")
    results: Mapped[List["Result"]] = relationship(back_populates="car")

    UniqueConstraint("manufacturer", "number")


