from .base import RealBase
from sqlalchemy.orm import Mapped, mapped_column


class Flag(RealBase):
    __tablename__ = "Flags"

    nascar_id: Mapped[int] = mapped_column(unique=True)
    name: Mapped[str]
