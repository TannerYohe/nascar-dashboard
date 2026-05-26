import logging

from sqlalchemy import Select
from sqlalchemy.orm import Session, Mapped
from sqlalchemy.engine import Engine

from nascar_api.models import (
    RaceInfo,
    LapData,
    RaceLaps,
    PitData,
    WeekendInfo,
    WeekendRunInfo,
    WeekendRaceInfo
)
from .orm import (Race, RealBase, Track, Driver, Flag, Series,
                 Stage, Infraction, Car, Lap, Event, DriverOnLap, PitStop, Weekend, WeekendRun, Result, Caution,
                 LeadSegment, StageResult, Hometown, Crew, Team, WeekendResult, WeekendRunResult)
from .orm import Series as oSeries
from nascar_api.enums import Flag as eFlag
from nascar_api.enums import Series as eSeries


from typing import List, Any, Optional, Type, TypeVar, Dict

T = TypeVar('T', bound=RealBase)
log = logging.getLogger(__name__)

class NascarModelError(Exception):
    pass


class ModelOrmImport:

    def __init__(self, engine: Engine):
        self.engine = engine
        self._session = None

    def __del__(self):
        self.session.close()

    @property
    def session(self) -> Session:
        if self._session is None or not self._session.is_active:
            self._session = Session(self.engine)
        return self._session

    def import_flags(self) -> None:
        for flag in eFlag:
            self._upsert(Flag, {Flag.nascar_id: flag.value},
                         {Flag.nascar_id: flag.value, Flag.name: flag.name})
        self.session.commit()

    def import_series(self) -> None:
        for series in eSeries:
            self._upsert(Series, {Series.nascar_id: series.value},
                         {Series.nascar_id: series.value, Series.name: series.name})
        self.session.commit()

    def import_race_info(self, race_info: RaceInfo) -> None:
        series = self._upsert(oSeries, {oSeries.nascar_id: race_info.series_id.value})
        if series is None:
            raise NascarModelError(f"No Series record found with nascar_id: {series.race_id}")
        track = self._upsert(Track, {Track.nascar_id: race_info.track_id},
                                       {Track.name: race_info.track_name})
        pole_winner = self._upsert(Driver, {Driver.nascar_id: race_info.pole_winner_driver_id})

        race = self._upsert(Race, {Race.nascar_id: race_info.race_id},
                            {
        Race.name: race_info.race_name,
        Race.type: race_info.race_type_id,
        Race.restrictor_plate: race_info.restrictor_plate,
        Race.scheduled_date: race_info.date_scheduled,
        Race.actual_date: race_info.race_date,
        Race.qualifying_date: race_info.qualifying_date,
        Race.tunein_date: race_info.tunein_date,
        Race.scheduled_distance: race_info.scheduled_distance,
        Race.actual_distance: race_info.actual_distance,
        Race.scheduled_laps: race_info.scheduled_laps,
        Race.actual_laps: race_info.actual_laps,
        Race.number_of_cars: race_info.number_of_cars_in_field,
        Race.pole_speed: race_info.pole_winner_speed,
        Race.average_speed: race_info.average_speed,
        Race.total_time: race_info.total_race_time,
        Race.margin_of_victory: race_info.margin_of_victory,
        Race.purse: race_info.race_purse,
        Race.comments: race_info.race_comments,
        Race.attendance: race_info.attendance,
        Race.radio_broadcaster: race_info.radio_broadcaster,
        Race.tv_broadcaster: race_info.television_broadcaster,
        Race.satellite_radio_broadcaster: race_info.satellite_radio_broadcaster,
        Race.master_id: race_info.master_race_id,
        Race.inspection_complete: race_info.inspection_complete,
        Race.playoff_round: race_info.playoff_round,
        Race.season: race_info.race_season,
                                Race.series_uuid: series.id_uuid,
                                Race.track_uuid: track.id_uuid,
                                Race.pole_winner_uuid: pole_winner.id_uuid
        })

        if race_info.stage_1_laps is not None:
            self._import_stages(race_info, race)

        if race_info.infractions:
            self._import_infractions(race_info, race)

        if race_info.schedule:
            self._import_events(race_info, race)

        self.session.commit()

    def _import_stages(self, race_info: RaceInfo, race: Race) -> None:
        for i, stage_laps in enumerate([race_info.stage_1_laps, race_info.stage_2_laps, race_info.stage_3_laps]):
            self._upsert(Stage, {Stage.race_uuid: race.id_uuid, Stage.stage_number: i},
                         {Stage.laps: stage_laps})

    def _import_infractions(self, race_info: RaceInfo, race: Race) -> None:
        for infraction in race_info.infractions:
            driver = self._upsert(Driver, {Driver.nascar_id: infraction.driver_id},
                                  {Driver.first_name: infraction.driver_fullname.split()[0],
                                   Driver.last_name: infraction.driver_fullname.split()[1]})
            car = self._upsert(Car, {Car.number: infraction.car_number}, {})
            lap = self._upsert(Lap, {Lap.lap_number: infraction.lap, Lap.race_uuid: race.id_uuid}, {})
            lap_assessed = self._upsert(Lap, {Lap.lap_number: infraction.lap_assessed, Lap.race_uuid: race.id_uuid}, {})
            self._upsert(Infraction,
                               {
                    Infraction.car.number: infraction.car_number,
                    Infraction.driver.nascar_id: infraction.driver_id,
                    Infraction.race_uuid: race.id_uuid,
                    Infraction.lap.lap_number: infraction.lap
                }, {
                    Infraction.driver_uuid: driver.id_uuid,
                    Infraction.car_uuid: car.id_uuid,
                    Infraction.lap_uuid: lap.id_uuid,
                    Infraction.lap_assessed_uuid: lap_assessed.id_uuid,
                               })

    def _import_events(self, race_info: RaceInfo, race: Race) -> None:
        for event in race_info.schedule:
            self._upsert(Event,
                         {Event.name: event.event_name, Event.run_type: event.run_type},
                         {Event.notes: event.notes, Event.start: event.start_time_utc,
                          Event.race_uuid: race.id_uuid})

    def import_lap_data(self, lap_data: LapData) -> None:
        race = self._get(Race, {Race.nascar_id: lap_data.race_id})
        if race is None:
            raise NascarModelError(f"No Race record found with nascar_id: {lap_data.race_id}")
        flag = self._get(Flag, {Flag.nascar_id: lap_data.flag_state.value})
        if flag is None:
            raise NascarModelError(f"No Flag record found with nascar_id: {lap_data.flag_state.value}")


        lap = self._upsert(Lap, {Lap.lap_number: lap_data.lap_number, Lap.race_uuid: race.id_uuid},
                           {
                               Lap.note: lap_data.note,
                                Lap.note_id: lap_data.note_id,
                                Lap.flag_uuid: flag.id_uuid,
                               Lap.race_uuid: race.id_uuid
                           })

        self._import_drivers(lap_data.driver_ids, lap)
        self.session.commit()

    def _import_drivers(self, driver_ids: List[int], lap: Lap) -> None:
        for driver_id in driver_ids:
            driver = self._upsert(Driver, {Driver.nascar_id: driver_id})
            self._upsert(DriverOnLap, {DriverOnLap.driver_uuid: driver.id_uuid, DriverOnLap.lap_uuid: lap.id_uuid})

    def import_race_lap(self, race_lap: RaceLaps) -> None:
        race = self._upsert(Race, {Race.nascar_id: race_lap.race_id})
        if race is None:
            raise NascarModelError(f"No Race record found with nascar_id: {race_lap.race_id}")
        driver = self._upsert(Driver, {Driver.nascar_id: race_lap.driver_id},
                              {Driver.first_name: race_lap.full_name.split()[0],
                                    Driver.last_name: race_lap.full_name.split()[1]})
        car = self._upsert(Car, {Car.number: race_lap.number, Car.manufacturer: race_lap.manufacturer})

        for lap_data in race_lap.laps:
            lap = self._upsert(Lap, {Lap.lap_number: lap_data.lap, Lap.race_uuid: race.id_uuid}, {})
            self._upsert(DriverOnLap, {DriverOnLap.driver_uuid: driver.id_uuid, DriverOnLap.lap_uuid: lap.id_uuid},
                                         {
                                                DriverOnLap.position: lap_data.running_pos,
                                                DriverOnLap.lap_time: lap_data.lap_time,
                                                DriverOnLap.lap_speed: lap_data.lap_speed,
                                                DriverOnLap.car_uuid: car.id_uuid
                                         })
        self.session.commit()

    def import_pit_data(self, pit_data: PitData) -> None:
        race = self._upsert(Race, {Race.nascar_id: pit_data.race_id})
        if race is None:
            raise NascarModelError(f"No Race record found with nascar_id: {pit_data.race_id}")
        pit_in_flag = self._upsert(Flag, {Flag.nascar_id: pit_data.pit_in_flag_status.value})
        if pit_in_flag is None:
            raise NascarModelError(f"No Flag record found with nascar_id: {pit_data.pit_in_flag_status.value}")
        pit_out_flag = self._upsert(Flag, {Flag.nascar_id: pit_data.pit_out_flag_status.value})
        if pit_out_flag is None:
            raise NascarModelError(f"No Flag record found with nascar_id: {pit_data.pit_out_flag_status.value}")
        car = self._upsert(Car, {Car.number: pit_data.vehicle_number,
                                          Car.manufacturer: pit_data.vehicle_manufacturer})
        driver = self._upsert(Driver, {Driver.first_name: pit_data.driver_name.split()[0],
                                                Driver.last_name: pit_data.driver_name.split()[1]})
        leader_lap = self._upsert(Lap, {Lap.lap_number: pit_data.leader_lap, Lap.race_uuid: race.id_uuid})

        self._upsert(PitStop, {PitStop.race_uuid: race.id_uuid, PitStop.lap_count: pit_data.lap_count},
                           {
        PitStop.pit_in_race_time: pit_data.pit_in_race_time,
        PitStop.pit_out_race_time: pit_data.pit_out_race_time,
        PitStop.total_duration: pit_data.total_duration,
        PitStop.box_stop_race_time: pit_data.box_stop_race_time,
        PitStop.box_leave_race_time: pit_data.box_leave_race_time,
        PitStop.pit_stop_duration: pit_data.pit_stop_duration,
        PitStop.in_travel_duration: pit_data.in_travel_duration,
        PitStop.out_travel_duration: pit_data.out_travel_duration,
        PitStop.pit_stop_type: pit_data.pit_stop_type,
        PitStop.left_front_tire_changed: pit_data.left_front_tire_changed,
        PitStop.right_front_tire_changed: pit_data.right_front_tire_changed,
        PitStop.left_rear_tire_changed: pit_data.left_rear_tire_changed,
        PitStop.right_rear_tire_changed: pit_data.right_rear_tire_changed,
        PitStop.previous_lap_time: pit_data.previous_lap_time,
        PitStop.next_lap_time: pit_data.next_lap_time,
        PitStop.pit_in_rank: pit_data.pit_in_rank,
        PitStop.pit_out_rank: pit_data.pit_out_rank,
        PitStop.positions_gained_lost: pit_data.positions_gained_lost,
        PitStop.pit_in_flag_uuid: pit_in_flag.id_uuid,
        PitStop.pit_out_flag_uuid: pit_out_flag.id_uuid,
        PitStop.car_uuid: car.id_uuid,
        PitStop.driver_uuid: driver.id_uuid,
        PitStop.leader_lap_uuid: leader_lap.id_uuid
        })
        self.session.commit()

    def import_weekend(self, weekend: WeekendInfo) -> None:
        week = self._upsert(Weekend, {Weekend.nascar_id: weekend.race_id})
        race = self._upsert(Race, {Race.nascar_id: weekend.race_id})
        if race is None:
            raise NascarModelError(f"No Race record found with nascar_id: {weekend.race_id}")
        race.weekend_uuid = week.id_uuid

        for race_info in weekend.weekend_race:
            self._import_weekend_race(race_info, race)

        for run_info in weekend.weekend_runs:
            self._import_weekend_run(run_info, week, race)
        self.session.commit()

    def _import_weekend_run(self, run_info: WeekendRunInfo, weekend: Weekend, race: Race) -> None:
        weekend_run = self._upsert(WeekendRun, {WeekendRun.nascar_run_id: run_info.weekend_run_id},
                                   {
        WeekendRun.nascar_timing_id: run_info.timing_run_id,
        WeekendRun.type: run_info.run_type,
        WeekendRun.name: run_info.run_name,
        WeekendRun.date: run_info.run_date,
        WeekendRun.date_utc: run_info.run_date_utc,
        WeekendRun.weekend_uuid: weekend.id_uuid
        })
        for result in run_info.results:
            driver = self._upsert(Driver, {Driver.nascar_id: result.driver_id},
                                  {Driver.first_name: result.driver_name.split()[0],
                                   Driver.last_name: result.driver_name.split()[1]})
            num = result.car_number if result.vehicle_number is None else result.vehicle_number
            car = self._upsert(Car, {Car.number: num, Car.manufacturer: result.manufacturer})
            res = self._upsert(Result,
                               {Result.race_uuid: race.id_uuid, Result.car_uuid: car.id_uuid,
                                Result.driver_uuid: driver.id_uuid},
                               {Result.finish_position: result.finishing_position})
            self._upsert(WeekendRunResult,
                                       {WeekendRunResult.result_uuid: res.id_uuid},
                                       {WeekendRunResult.best_lap_time: result.best_lap_time,
                                        WeekendRunResult.best_lap_speed: result.best_lap_speed,
                                        WeekendRunResult.best_lap_number: result.best_lap_number,
                                        WeekendRunResult.laps_completed: result.laps_completed,
                                        WeekendRunResult.comment: result.comment,
                                        WeekendRunResult.delta_leader: result.delta_leader,
                                        WeekendRunResult.disqualified: result.disqualified,
                                        WeekendRunResult.run_uuid: weekend_run.id_uuid})

    def _import_weekend_race(self, race_info: WeekendRaceInfo, race: Race) -> None:
        self._import_cautions(race_info, race)
        self._import_leaders(race_info, race)
        self._import_stage_results(race_info, race)
        self._import_weekend_result(race_info, race)

    def _import_cautions(self, race_info: WeekendRaceInfo, race: Race) -> None:
        for caution in race_info.caution_segments:
            flag = self._upsert(Flag, {Flag.nascar_id: caution.flag_state.value})
            if flag is None:
                raise NascarModelError(f"No Flag record found with nascar_id: {caution.flag_state.value}")

            updates = {Caution.reason: caution.reason, Caution.comment: caution.comment,
                       Caution.flag_uuid: flag.id_uuid}
            if caution.beneficiary_car_number is not None:
                sql = Select(Car).where(Car.number == caution.beneficiary_car_number).join(Result).join(Race).where(Race.id_uuid == race.id_uuid)
                car = self.session.scalar(sql)
                if car is None:
                    log.warning(f"No Car record found with number {caution.beneficiary_car_number} in race {race.id_uuid}. Not assigning beneficiary car to caution.")
                else:
                    updates.update({Caution.beneficiary_car_uuid: car.id_uuid})

            self._upsert(Caution,
                                       {Caution.race_uuid: race.id_uuid, Caution.start_lap: caution.start_lap,
                                        Caution.end_lap: caution.end_lap},
                                       updates)

    def _import_leaders(self, race_info: WeekendRaceInfo, race: Race) -> None:
        for leader in race_info.race_leaders:
            sql = Select(Car).where(Car.number == leader.car_number).join(Result).join(Race).where(
                Race.id_uuid == race.id_uuid)
            car = self.session.scalar(sql)
            if car is None:
                log.warning(
                    f"No Car record found with number {leader.car_number} in race {race.id_uuid}. Not assigning car to leader segment.")
            start_lap = self._upsert(Lap, {Lap.lap_number: leader.start_lap, Lap.race_uuid: race.id_uuid})
            end_lap = self._upsert(Lap, {Lap.lap_number: leader.end_lap, Lap.race_uuid: race.id_uuid})
            self._upsert(LeadSegment, {LeadSegment.race_uuid: race.id_uuid,
                                                    LeadSegment.start_lap_uuid: start_lap.id_uuid,
                                                    LeadSegment.end_lap_uuid: end_lap.id_uuid},
                         {LeadSegment.car_uuid: car.id_uuid} if car else None)

    def _import_stage_results(self, race_info: WeekendRaceInfo, race: Race) -> None:
        for stage_result in race_info.stage_results:
            stage = self._upsert(Stage, {Stage.race_uuid: race.id_uuid, Stage.stage_number: stage_result.stage_number})
            for result in stage_result.results:
                driver = self._upsert(Driver, {Driver.nascar_id: result.driver_id},
                                      {Driver.first_name: result.driver_fullname.split()[0],
                                       Driver.last_name: result.driver_fullname.split()[1]})
                sql = Select(Car).where(Car.number == result.car_number).join(Result).join(Race).where(
                    Race.id_uuid == race.id_uuid)
                car = self.session.scalar(sql)
                updates = {Result.finish_position: result.finishing_position}
                if car is None:
                    log.warning(
                        f"No Car record found with number {result.car_number} in race {race.id_uuid}. Not assigning car to result.")
                else:
                    updates.update({Result.car_uuid: car.id_uuid})
                res = self._upsert(Result, {Result.driver_uuid: driver.id_uuid, Result.race_uuid: race.id_uuid}, updates)
                self._upsert(StageResult,
                                         {StageResult.stage_uuid: stage.id_uuid, StageResult.result_uuid: res.id_uuid},
                                         {StageResult.stage_points: result.stage_points})

    def _import_weekend_result(self, race_info: WeekendRaceInfo, race: Race) -> None:
        for weekend_result in race_info.results:
            car = self._upsert(Car, {Car.number: weekend_result.car_number, Car.manufacturer: weekend_result.car_make},
                               {Car.model: weekend_result.car_model})
            hometown = self._upsert(Hometown, {Hometown.city: weekend_result.hometown_city,
                                               Hometown.state: weekend_result.hometown_state},
                                    {
                                        Hometown.country: weekend_result.hometown_country} if weekend_result.hometown_country else {})
            driver = self._upsert(Driver, {Driver.nascar_id: weekend_result.driver_id},
                                  {Driver.first_name: weekend_result.driver_fullname.split()[0],
                                   Driver.last_name: weekend_result.driver_fullname.split()[1],
                                   Driver.hometown_uuid: hometown.id_uuid})
            res = self._upsert(Result, {Result.race_uuid: race.id_uuid, Result.car_uuid: car.id_uuid,
                                        Result.driver_uuid: driver.id_uuid})
            crew_chief = self._upsert(Crew, {Crew.nascar_id: weekend_result.crew_chief_id, Crew.roll: "Crew Chief"},
                                      {Crew.full_name: weekend_result.crew_chief_fullname})
            owner = self._upsert(Crew, {Crew.nascar_id: weekend_result.owner_id, Crew.roll: "Owner"},
                                 {Crew.full_name: weekend_result.owner_fullname})
            team = self._upsert(Team, {Team.nascar_id: weekend_result.team_id},
                                {Team.name: weekend_result.team_name})
            self._upsert(WeekendResult, {WeekendResult.result_uuid: res.id_uuid},
                         {WeekendResult.diff_laps: weekend_result.diff_laps,
                          WeekendResult.diff_time: weekend_result.diff_time,
                          WeekendResult.disqualified: weekend_result.disqualified,
                          WeekendResult.laps_complete: weekend_result.laps_complete,
                          WeekendResult.finish_status: weekend_result.finishing_status,
                          WeekendResult.laps_led: weekend_result.laps_led,
                          WeekendResult.playoff_points_earned: weekend_result.playoff_points_earned,
                          WeekendResult.points_delta: weekend_result.points_delta,
                          WeekendResult.points_earned: weekend_result.points_earned,
                          WeekendResult.points_position: weekend_result.points_position,
                          WeekendResult.qualifying_order: weekend_result.qualifying_order,
                          WeekendResult.qualifying_position: weekend_result.qualifying_position,
                          WeekendResult.qualifying_speed: weekend_result.qualifying_speed,
                          WeekendResult.sponsor: weekend_result.sponsor,
                          WeekendResult.starting_position: weekend_result.starting_position,
                          WeekendResult.times_led: weekend_result.times_led,
                          WeekendResult.winnings: weekend_result.winnings,
                          WeekendResult.result_uuid: res.id_uuid,
                          WeekendResult.crew_chief_uuid: crew_chief.id_uuid,
                          WeekendResult.owner_uuid: owner.id_uuid,
                          WeekendResult.team_uuid: team.id_uuid})

    def _upsert(self, model: Type[T], query: Dict[Mapped, Any], updates: Optional[Dict[Mapped, Any]] = None) -> T:
        result = self._get(model, query)

        if result is None:
            result = self._create(model, query)

        if updates:
            result = self._update(result, updates)
        return result

    def _get(self, model: Type[T], query: Dict[Mapped, Any]) -> Optional[T]:
        sql = Select(model)
        for column, value in query.items():
            sql = sql.where(column == value)
        return self.session.scalar(sql)

    def _create(self, model: Type[T], attrs: Dict[Mapped, Any]) -> T:
        mod = model(**{column.name: value for column, value in attrs.items()})
        self.session.add(mod)
        return mod

    def _update(self, model: T, updates: Dict[Mapped, Any]) -> T:
        for column, value in updates.items():
            setattr(model, column.name, value)
        return model
