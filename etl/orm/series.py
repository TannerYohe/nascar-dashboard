from .base import RealBase
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List


class Series(RealBase):
    __tablename__ = "Series"

    nascar_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str]

    races: Mapped[List["Race"]] = relationship(back_populates="series")
