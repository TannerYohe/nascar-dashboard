from .base import RealBase
from .race import Race
from .car import Car
from .lap import Lap
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID


class LeadSegment(RealBase):
    __tablename__ = "LeadSegments"

    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="leader_segments")
    car_uuid: Mapped[UUID] = mapped_column(ForeignKey("Cars.id_uuid"))
    car: Mapped[Car] = relationship(back_populates="lead_segments")
    start_lap_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    start_lap: Mapped[Lap] = relationship(foreign_keys=[start_lap_uuid])
    end_lap_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    end_lap: Mapped[Lap] = relationship(foreign_keys=[end_lap_uuid])

    UniqueConstraint("race_uuid", "car_uuid", "start_lap_uuid")
    UniqueConstraint("race_uuid", "car_uuid", "end_lap_uuid")
    UniqueConstraint("race_uuid", "start_lap_uuid", "end_lap_uuid")