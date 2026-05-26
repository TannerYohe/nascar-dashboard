# NASCAR Dashboard

> **Work in Progress** — This project is under active development. Features and APIs may change.

A dashboard and ETL pipeline for collecting and visualizing NASCAR race data.

## Overview

This project has two components:

- **Dashboard** (WIP) — A [Shiny for Python](https://shiny.posit.co/py/) web app for exploring NASCAR race data interactively. Select a season, series, and race to view detailed race information.
- **ETL** — A data pipeline that pulls race data from the NASCAR API (via [nascar-api](https://github.com/TannerYohe/nascar-api)) and loads it into a SQLite database using SQLAlchemy.

## Project Structure

```
├── app.py              # Shiny dashboard entry point
├── etl/
│   ├── main.py         # ETL entry point
│   ├── model_to_orm.py # API model to ORM mapping
│   ├── util.py         # Shared utilities
│   └── orm/            # SQLAlchemy models
├── pyproject.toml
└── data/               # Parquet data files (not tracked)
```

## Requirements

- Python 3.11+

## License

[MIT](LICENSE)
