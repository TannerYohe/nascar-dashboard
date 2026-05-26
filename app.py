from shiny import render, ui, reactive
from shiny.express import input
import duckdb as db
import pandas as pd
from etl.util import get_series_str

con = db.read_parquet("data/races/**/*.parquet", hive_partitioning=True, union_by_name=True)
ui.panel_title("Race Rewind")

ui.input_select("race_year", "Select a season:",
                choices={str(year[0]): str(year[0]) for year in db.sql("SELECT distinct(year) "
                                                               "FROM con ORDER BY year").fetchall()})
ui.input_select("series", "Select a championship:",
                choices={str(series_id[0]): str(get_series_str(series_id[0])) for series_id in
                 db.sql("SELECT distinct(series) FROM con ORDER BY series").fetchall()})
ui.input_select("race", "Select a race:", {})

@reactive.effect
def _():
    choices = {str(race_id): race_name
               for race_id, race_name in
               db.sql(f"SELECT race_id, race_name FROM con "
                      f"WHERE year={input.race_year()} AND series={input.series()} "
                      f"ORDER BY race_name"
                      ).fetchall()}
    ui.update_select("race", choices=choices)