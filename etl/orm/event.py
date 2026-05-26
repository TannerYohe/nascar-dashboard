from .base import RealBase
from .race import Race
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from datetime import datetime


class Event(RealBase):
    __tablename__ = "Events"

    name: Mapped[str]
    notes: Mapped[str]
    start: Mapped[datetime]
    run_type: Mapped[int]

    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="schedule")

    UniqueConstraint("name", "race_uuid")