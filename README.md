# NasDash

> **Work in progress.** The replay screen, championship standings and driver, team and track pages are the first pages; more are coming.

A web app for exploring NASCAR seasons: replay any race, follow the championship standings, and look up any driver, team or track. To replay a race, pick a season, series and race, then watch the field run lap by lap on a map of the track, with:

- the flag state, lap, stage, and laps to go
- the running order, with gap to the leader or interval to the car ahead, last and best lap times, and pit stop counts
- penalties as they're given and when they're served
- every pit stop, with tires changed, time on pit road, and positions gained or lost
- a race feed of cautions, lead changes, stage results and lap notes
- playback at 0.25× to 64×, lap stepping, and a scrubber marked with cautions, stage ends and penalties
- car filters by driver, team, manufacturer or the current top 10, hiding or dimming the rest

The data comes from the `nascar` schema on Aurora DSQL, which the [cadence](https://github.com/TannerYohe/cadence) repo loads. This app only reads it.

## How the replay works

The data has lap times, not live positions. Summing each car's lap times gives the moment it crossed the line on every lap, and the replay moves each car around the track between crossings. The running order and gaps come from those crossings, the same way timing and scoring works, so positions change at the line.

Pit stops are drawn from the pit data. On an in-lap the car runs at its normal pace, then brakes onto pit road at the pit-in time. On pit road it drives to its box, sits there for the stop, and drives to the exit at the pit-out time. On the out-lap it accelerates back up to speed. Where the start/finish line is comes from each race's own timing: where cars cross the line relative to pit road (mid pit road at Martinsville, past pit exit at Talladega).

Penalties come from the official infraction records when present. They're also read out of the lap notes ("#34 penalized for pit road speeding", "#23 serves his stop and go penalty"), since the official records are often empty. A penalty is marked served when a note says so. Otherwise the app infers it: a penalty given under caution is served at the next restart, and one given under green is matched to the car's next stop with no tire change within 5 laps. When nothing matches, the penalty shows as "serving not recorded".

## Championship standings

The standings page charts every driver's championship position, gap to the leader or points after each race of a season, using the standings cadence stores after every race (`points_standing`). The playoff format comes from the schedule: several playoff rounds means the elimination playoffs (through 2025, with a reset and a cut each round), and a single round means the Chase (2026 on, one reset and no eliminations). Seeds are worked out from the first playoff race's points, less what each driver earned in it.

## Drivers, teams and tracks

`/drivers`, `/teams` and `/tracks` list everyone in a series with their record, and each one has a page of its own: starts, wins, podiums (top 3), top 5s and 10s, poles, laps led and average finish, the best championship finish, the fastest lap, crash and DNF rates, and season, track, team or driver breakdowns. Only points races count. A crash is a finishing status of accident, crash or DVP, and a DNF is any status other than running. The feed has no team ids, so a team is every team name that reduces to the same slug. Lap speeds over 215 mph are treated as timing glitches. Every page says which season the data starts in, since nothing before it is counted.

## Layout

```
backend/          Litestar API (Python 3.14, uv)
  src/nascar_dashboard/
    models.py       read-only models of the cadence tables
    services/       race listings, replay bundle, flag timeline, penalty parsing, standings, records
    routes/         /api/seasons, /api/races, /api/races/{id}, /api/races/{id}/replay, /api/standings,
                    /api/drivers, /api/teams, /api/tracks (and /{id} for each)
  scripts/seed_dev_db.py   load races from the public NASCAR feed into SQLite
  tests/
frontend/         React + TypeScript (Vite, Tailwind, TanStack Query, zustand)
  src/features/replay/     replay screen; engine/ is the timing model (unit tested)
  src/features/picker/     race browser and Ctrl-K search
  src/features/standings/  championship standings across a season
  src/features/stats/      shared pieces of the driver, team and track pages (drivers/, teams/, tracks/)
  public/tracks/           track layouts, generated from OpenStreetMap
scripts/tracks/   builds the track layouts (tracks.toml + build_tracks.py)
```

## Running locally

You need [uv](https://docs.astral.sh/uv/) and Node 22+.

### Against DSQL

The API connects as a read-only role. Create it once in the cluster (as an admin):

```sql
CREATE ROLE dashboard_reader WITH LOGIN;
AWS IAM GRANT dashboard_reader TO 'arn:aws:iam::<account>:role/<your-role>';
GRANT USAGE ON SCHEMA nascar TO dashboard_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA nascar TO dashboard_reader;
```

Your IAM principal also needs `dsql:DbConnect` on the cluster. Then:

```sh
cd backend
uv sync
export DSQL_ENDPOINT=<cluster-id>.dsql.<region>.on.aws AWS_REGION=<region>   # or put them in backend/.env
uv run litestar --app nascar_dashboard.main:app run --reload
```

### Without DSQL

Seed a local SQLite file from the public NASCAR feed and point the API at it:

```sh
cd backend
uv run --group seed python scripts/seed_dev_db.py --db dev.db --year 2025 --series 1 --latest 5
DATABASE_URL=sqlite:///dev.db uv run litestar --app nascar_dashboard.main:app run --reload
```

### The UI

```sh
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api to :8000
```

`/replay/<race_id>?lap=120` opens a race at a given lap.

Keyboard shortcuts on the replay: Space play/pause · ←/→ previous/next lap (Shift for 10) · `[` `]` slower/faster · Home restart · Ctrl/⌘-K search races.

## Tests

```sh
cd backend && uv run pytest && uv run ruff check && uv run ty check src tests
cd frontend && npm test && npx tsc -b
```

## Track maps

`python scripts/tracks/build_tracks.py` rebuilds the layouts. For each track in `scripts/tracks/tracks.toml` it fetches the `highway=raceway` ways around the venue from OpenStreetMap. It joins them into a graph and takes the loop closest to each lap length raced there, so one venue can have an oval and a road course. The map's start/finish defaults to beside the middle of pit road. The app moves it to where the race's timing puts it. Add `--sheet out.html` to get a page that shows every layout with its start/finish line and race direction, for checking. A track with no layout (temporary street courses, dirt tracks) falls back to a generic oval.

Map data © OpenStreetMap contributors, available under the [ODbL](https://www.openstreetmap.org/copyright).

## Deployment

The app runs on AWS. CloudFront serves the built UI from S3 and sends `/api/*` to the API, a container image on Lambda behind a function URL. Every merge to `master` runs CI, tags the next calendar version (`v2026.11.0`, `v2026.11.1`, ...), pushes the image, deploys, and publishes a GitHub Release. Pull requests run the same CI.

See [docs/deployment.md](docs/deployment.md) for the architecture, costs, rollbacks and one-time setup.

## License

[PolyForm Noncommercial 1.0.0](LICENSE): free to use, change and share for any noncommercial purpose. Commercial use needs a separate license. The track layouts in `frontend/public/tracks/` are derived from OpenStreetMap and are licensed under the [ODbL](https://opendatacommons.org/licenses/odbl/) instead (see [Track maps](#track-maps)).
