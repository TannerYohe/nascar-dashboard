from .base import RealBase
from .race import Race
from .flag import Flag
from .car import Car
from .driver import Driver
from .lap import Lap
from .infraction import Infraction
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, UniqueConstraint
from uuid import UUID
from typing import Optional


class PitStop(RealBase):
    __tablename__ = "PitStops"

    lap_count: Mapped[int]
    pit_in_race_time: Mapped[float]
    pit_out_race_time: Mapped[float]
    total_duration: Mapped[float]
    box_stop_race_time: Mapped[float]
    box_leave_race_time: Mapped[float]
    pit_stop_duration: Mapped[float]
    in_travel_duration: Mapped[float]
    out_travel_duration: Mapped[float]
    pit_stop_type: Mapped[str]
    left_front_tire_changed: Mapped[bool]
    right_front_tire_changed: Mapped[bool]
    left_rear_tire_changed: Mapped[bool]
    right_rear_tire_changed: Mapped[bool]
    previous_lap_time: Mapped[float]
    next_lap_time: Mapped[float]
    pit_in_rank: Mapped[Optional[int]]
    pit_out_rank: Mapped[Optional[int]]
    positions_gained_lost: Mapped[Optional[int]]

    pit_in_flag_uuid: Mapped[UUID] = mapped_column(ForeignKey("Flags.id_uuid"))
    pit_in_flag: Mapped[Flag] = relationship(foreign_keys=[pit_in_flag_uuid])
    pit_out_flag_uuid: Mapped[UUID] = mapped_column(ForeignKey("Flags.id_uuid"))
    pit_out_flag: Mapped[Flag] = relationship(foreign_keys=[pit_out_flag_uuid])
    race_uuid: Mapped[UUID] = mapped_column(ForeignKey("Races.id_uuid"))
    race: Mapped[Race] = relationship(back_populates="pitstops")
    car_uuid: Mapped[UUID] = mapped_column(ForeignKey("Cars.id_uuid"))
    car: Mapped[Car] = relationship(back_populates="pitstops")
    driver_uuid: Mapped[UUID] = mapped_column(ForeignKey("Drivers.id_uuid"))
    driver: Mapped[Driver] = relationship(back_populates="pitstops")
    leader_lap_uuid: Mapped[UUID] = mapped_column(ForeignKey("Laps.id_uuid"))
    leader_lap: Mapped[Lap] = relationship(back_populates="pitstops")
    infraction_uuid: Mapped[Optional[UUID]] = mapped_column(
        ForeignKey("Infractions.id_uuid")
    )
    infraction: Mapped[Optional[Infraction]] = relationship(back_populates="pitstop")

    UniqueConstraint("driver_uuid", "leader_lap_uuid")
    UniqueConstraint("car_uuid", "leader_lap_uuid")