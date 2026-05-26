from sqlalchemy.testing.schema import mapped_column

from .base import RealBase
from sqlalchemy.orm import Mapped, relationship
from typing import List


class Team(RealBase):
    __tablename__ = "Teams"

    name: Mapped[str]
    nascar_id: Mapped[str] = mapped_column(unique=True)

    weekend_results: Mapped[List["WeekendResult"]] = relationship(back_populates="team")
