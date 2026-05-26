from .base import RealBase
from .result import Result
from .crew import Crew
from .team import Team
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from uuid import UUID


class WeekendResult(RealBase):
    __tablename__ = "WeekendResults"

    diff_laps: Mapped[int]
    diff_time: Mapped[float]
    disqualified: Mapped[bool]
    laps_complete: Mapped[int]
    finish_status: Mapped[str]
    laps_led: Mapped[int]
    playoff_points_earned: Mapped[int]
    points_delta: Mapped[int]
    points_earned: Mapped[int]
    points_position: Mapped[int]
    qualifying_order: Mapped[int]
    qualifying_position: Mapped[int]
    qualifying_speed: Mapped[float]
    nascar_result_id: Mapped[int]
    sponsor: Mapped[str]
    starting_position: Mapped[int]
    times_led: Mapped[int]
    winnings: Mapped[int]

    result_uuid: Mapped[UUID] = mapped_column(ForeignKey("Results.id_uuid"))
    result: Mapped[Result] = relationship(back_populates="weekend_result")
    crew_chief_uuid: Mapped[UUID] = mapped_column(ForeignKey("Crew.id_uuid"))
    crew_chief: Mapped[Crew] = relationship(back_populates="chief_weekend_results", foreign_keys=[crew_chief_uuid])
    owner_uuid: Mapped[UUID] = mapped_column(ForeignKey("Crew.id_uuid"))
    owner: Mapped[Crew] = relationship(back_populates="owner_weekend_results", foreign_keys=[owner_uuid])
    team_uuid: Mapped[UUID] = mapped_column(ForeignKey("Teams.id_uuid"))
    team: Mapped[Team] = relationship(back_populates="weekend_results")
