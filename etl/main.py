import logging
from functools import cached_property
from typing import List

from requests import HTTPError

from nascar_api.enums import Series
from nascar_api.repos import HistoricNascarRepo
from sqlalchemy import create_engine, Select, Engine
from sqlalchemy.orm import Session

from .orm import RealBase, Race

from .model_to_orm import ModelOrmImport

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
ch = logging.StreamHandler()
ch.setFormatter(logging.Formatter('%(asctime)s [%(name)s] %(levelname)s - %(message)s'))
log.addHandler(ch)

class Helper:

    def __init__(self, engine: Engine):
        self.engine = engine

    @cached_property
    def importer(self) -> ModelOrmImport:
        return ModelOrmImport(self.engine)

    @cached_property
    def repo(self) -> HistoricNascarRepo:
        return HistoricNascarRepo()

    def run(self, drop_all: bool = False):
        self.initialize_db(drop_all)
        self.pull_seasons([year for year in range(2015, 2025)], [Series.CUP, Series.XFINITY, Series.TRUCK])
        session = Session(self.engine)
        races = session.scalars(Select(Race).where(Race.season > 2019)).all()
        # self.pull_lap_times(races)
        self.pull_lap_notes(races)
        self.pull_pit_data(races)
        self.pull_weekend(races)
        session.close()

    def initialize_db(self, drop_db: bool = False):
        log.info("Initializing database")
        if drop_db:
            RealBase.metadata.drop_all(self.engine)
        RealBase.metadata.create_all(self.engine)
        self.importer.import_flags()
        self.importer.import_series()
        log.info("Database initialized")

    def pull_race(self, race_id: int) -> None:
        pass


    def pull_seasons(self, seasons: List[int], series: List[Series]) -> None:
        log.info("Pulling race seasons")
        for season in seasons:
            for seri in series:
                try:
                    races = self.repo.get_races(season, seri)
                except HTTPError as e:
                    if e.response.status_code == 403:
                        log.warning(f"Race info is not available for the {season} {seri.name} season")
                        continue
                    raise
                for race in races:
                    self.importer.import_race_info(race)
        log.info("Race seasons pulled")

    def pull_lap_notes(self, races: List[Race]) -> None:
        log.info("Pulling lap notes")
        for race in races:
            try:
                laps = self.repo.get_lap_notes(race.season, Series(race.series.nascar_id), race.nascar_id)
            except HTTPError as e:
                if e.response.status_code == 403:
                    log.warning(f"Lap notes are not available for the {race.season} {race.name} ({race.nascar_id})")
                    continue
                raise
            for lap in laps:
                self.importer.import_lap_data(lap)
            log.debug(f"Lap notes for the {race.season} {race.name} ({race.nascar_id}) imported")
        log.info("Lap notes pulled")

    def pull_lap_times(self, races: List[Race]) -> None:
        log.info("Pulling lap times")
        for race in races:
            try:
                laps = self.repo.get_lap_times(race.season, Series(race.series.nascar_id), race.nascar_id)
            except HTTPError as e:
                if e.response.status_code == 403:
                    log.warning(f"Lap times are not available for the {race.season} {race.name} ({race.nascar_id})")
                    continue
                raise
            for lap in laps:
                self.importer.import_race_lap(lap)
            log.debug(f"Lap times for the {race.season} {race.name} ({race.nascar_id}) imported")
        log.info("Lap times pulled")

    def pull_pit_data(self, races: List[Race]):
        log.info("Pulling pit data")
        for race in races:
            try:
                pit_stops = self.repo.get_pit_data(Series(race.series.nascar_id), race.nascar_id)
            except HTTPError as e:
                if e.response.status_code == 403:
                    log.warning(f"Pit data is not available for the {race.season} {race.name} ({race.nascar_id})")
                    continue
                raise
            for pit_stop in pit_stops:
                self.importer.import_pit_data(pit_stop)
            log.debug(f"Pit stops for the {race.season} {race.name} ({race.nascar_id}) imported")
        log.info("Pit data pulled")

    def pull_weekend(self, races: List[Race]):
        log.info("Pulling weekend data")
        for race in races:
            try:
                weekend = self.repo.get_weekend_data(race.season, Series(race.series.nascar_id), race.nascar_id)
            except HTTPError as e:
                if e.response.status_code == 403:
                    log.warning(f"Weekend data is not available for the {race.season} {race.name} ({race.nascar_id})")
                    continue
                raise
            self.importer.import_weekend(weekend)
        log.info("Weekend data pulled")



if __name__ == "__main__":
    engine = create_engine("sqlite:///nascar.db")
    helper = Helper(engine)
    helper.run(drop_all=True)
