from sqlalchemy.testing.schema import mapped_column

from .base import RealBase
from sqlalchemy.orm import Mapped, relationship
from typing import List


class Weekend(RealBase):
    __tablename__ = "Weekends"

    nascar_id: Mapped[int] = mapped_column(unique=True)

    races: Mapped[List["Race"]] = relationship(back_populates="weekend")
    runs: Mapped[List["WeekendRun"]] = relationship(back_populates="weekend")
