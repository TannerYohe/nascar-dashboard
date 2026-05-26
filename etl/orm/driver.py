from sqlalchemy import ForeignKey

from .base import RealBase
from .hometown import Hometown
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional
from uuid import UUID


class Driver(RealBase):
    __tablename__ = "Drivers"

    nascar_id: Mapped[int] = mapped_column(unique=True)
    first_name: Mapped[Optional[str]] = mapped_column(nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(nullable=True)

    hometown_uuid: Mapped[Optional[UUID]] = mapped_column(ForeignKey("Hometowns.id_uuid"), nullable=True)
    hometown: Mapped[Hometown] = relationship(back_populates="drivers")

    poles: Mapped[List["Race"]] = relationship(back_populates="pole_winner")
    infractions: Mapped[List["Infraction"]] = relationship(back_populates="driver")
    pitstops: Mapped[List["PitStop"]] = relationship(back_populates="driver")
    laps: Mapped[List["DriverOnLap"]] = relationship(back_populates="driver")
    results: Mapped[List["Result"]] = relationship(back_populates="driver")
