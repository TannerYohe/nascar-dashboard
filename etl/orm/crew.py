from sqlalchemy.testing.schema import mapped_column

from .base import RealBase
from sqlalchemy.orm import Mapped, relationship
from typing import List


class Crew(RealBase):
    __tablename__ = "Crew"

    full_name: Mapped[str]
    nascar_id: Mapped[int] = mapped_column(unique=True)
    roll: Mapped[str]

    owner_weekend_results: Mapped[List["WeekendResult"]] = relationship(
        back_populates="owner", foreign_keys="WeekendResult.owner_uuid"
    )
    chief_weekend_results: Mapped[List["WeekendResult"]] = relationship(
        back_populates="crew_chief", foreign_keys="WeekendResult.crew_chief_uuid"
    )
