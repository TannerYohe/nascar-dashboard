from .base import RealBase
from .driver import Driver
from .track import Track
from .series import Series
from .weekend import Weekend
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from datetime import datetime
from uuid import UUID
from typing import List, Optional


class Race(RealBase):
    __tablename__ = "Races"

    nascar_id: Mapped[int] = mapped_column(unique=True)
    master_id: Mapped[int]
    name: Mapped[str]
    type: Mapped[int]
    restrictor_plate: Mapped[bool]
    scheduled_date: Mapped[datetime]
    actual_date: Mapped[datetime]
    qualifying_date: Mapped[datetime]
    tunein_date: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    scheduled_distance: Mapped[float]
    actual_distance: Mapped[float]
    scheduled_laps: Mapped[int]
    actual_laps: Mapped[int]
    number_of_cars: Mapped[int]
    pole_speed: Mapped[float]
    average_speed: Mapped[float]
    total_time: Mapped[Optional[str]] = mapped_column(nullable=True)
    margin_of_victory: Mapped[Optional[str]] = mapped_column(nullable=True)
    purse: Mapped[float]
    comments: Mapped[Optional[str]] = mapped_column(nullable=True)
    attendance: Mapped[int]
    radio_broadcaster: Mapped[str]
    tv_broadcaster: Mapped[str]
    satellite_radio_broadcaster: Mapped[Optional[str]] = mapped_column(nullable=True)
    inspection_complete: Mapped[Optional[bool]] = mapped_column(nullable=True)
    playoff_round: Mapped[Optional[int]] = mapped_column(nullable=True)
    season: Mapped[int]

    series_uuid: Mapped[UUID] = mapped_column(ForeignKey("Series.id_uuid"))
    series: Mapped[Series] = relationship(back_populates="races")
    pole_winner_uuid: Mapped[UUID] = mapped_column(ForeignKey("Drivers.id_uuid"))
    pole_winner: Mapped[Driver] = relationship(back_populates="poles")
    track_uuid: Mapped[UUID] = mapped_column(ForeignKey("Tracks.id_uuid"))
    track: Mapped[Track] = relationship(back_populates="races")
    weekend_uuid: Mapped[Optional[UUID]] = mapped_column(ForeignKey("Weekends.id_uuid"), nullable=True)
    weekend: Mapped[Weekend] = relationship(back_populates="races")

    pitstops: Mapped[List["PitStop"]] = relationship(back_populates="race")
    schedule: Mapped[List["Event"]] = relationship(back_populates="race")
    laps: Mapped[List["Lap"]] = relationship(back_populates="race")
    cautions: Mapped[List["Caution"]] = relationship(back_populates="race")
    infractions: Mapped[List["Infraction"]] = relationship(back_populates="race")
    flags: Mapped[List["RaceHasFlag"]] = relationship(back_populates="race")
    leader_segments: Mapped[List["LeadSegment"]] = relationship(back_populates="race")
    stages: Mapped[List["Stage"]] = relationship(back_populates="race")
    results: Mapped[List["Result"]] = relationship(back_populates="race")
