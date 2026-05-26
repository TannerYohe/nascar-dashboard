from .base import RealBase
from sqlalchemy.orm import Mapped, relationship
from sqlalchemy import UniqueConstraint
from typing import List, Optional


class Hometown(RealBase):
    __tablename__ = "Hometowns"

    city: Mapped[str]
    state: Mapped[str]
    country: Mapped[Optional[str]]

    drivers: Mapped[List["Driver"]] = relationship(back_populates="hometown")

    UniqueConstraint("city", "state")