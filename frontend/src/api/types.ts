// Mirrors backend/src/nascar_dashboard/schemas.py.

export type RaceStatus = 'scheduled' | 'live' | 'finished'

export interface SeriesCount {
  series_id: number
  race_count: number
}

export interface Season {
  year: number
  series: SeriesCount[]
}

export interface Winner {
  driver_id: number | null
  name: string | null
  car_number: number | null
}

export interface RaceSummary {
  race_id: number
  series_id: number
  season: number
  race_name: string | null
  track_id: number | null
  track_name: string | null
  race_date: string | null
  round: number | null
  is_exhibition: boolean
  playoff_round: number | null
  scheduled_laps: number | null
  actual_laps: number | null
  winner: Winner | null
  has_lap_data: boolean
  status: RaceStatus
}

export interface RaceDetail extends RaceSummary {
  stage_ends: number[]
  track_length_mi: number | null
  scheduled_distance: number | null
  number_of_cautions: number | null
  number_of_caution_laps: number | null
  number_of_lead_changes: number | null
  number_of_leaders: number | null
  average_speed: number | null
  margin_of_victory: string | null
  total_race_time: string | null
  television_broadcaster: string | null
}

export interface ReplayDriver {
  driver_id: number
  car_number: number | null
  name: string | null
  manufacturer: string | null
  team: string | null
  sponsor: string | null
  start_pos: number | null
  finish_pos: number | null
  finishing_status: string | null
  laps_led: number | null
}

export interface DriverLaps {
  driver_id: number
  /** Index i is lap i. Lap 0 is the grid. */
  times: (number | null)[]
  positions: (number | null)[]
}

export interface Caution {
  start_lap: number
  end_lap: number
  flag_state: number | null
  reason: string | null
  comment: string | null
  beneficiary_car_number: number | null
}

export interface Leader {
  start_lap: number
  end_lap: number
  car_number: number
}

export type Tire = 'LF' | 'RF' | 'LR' | 'RR'

export interface PitStop {
  car_number: number
  driver_name: string | null
  /** Laps the car had completed at pit-in. */
  lap: number | null
  /** Laps the leader had completed at pit-in. */
  leader_lap: number | null
  /** The lap the leader was running at pit-in, numbered like lap notes and penalties. */
  note_lap: number | null
  in_time: number
  out_time: number | null
  box_in_time: number | null
  box_out_time: number | null
  stop_duration: number | null
  in_travel: number | null
  out_travel: number | null
  total_duration: number | null
  stop_type: string | null
  tires: Tire[]
  in_flag: number | null
  out_flag: number | null
  in_rank: number | null
  out_rank: number | null
  positions_gained: number | null
  infraction: string | null
}

export interface Penalty {
  id: string
  car_number: number
  driver_id: number | null
  lap: number
  infraction: string
  penalty: string | null
  detail: string | null
  source: 'official' | 'lap_note' | 'pit_stop'
  served_lap: number | null
  served_how: 'lap_note' | 'pit_stop' | 'restart' | null
}

export interface LapNote {
  lap: number
  note_id: number
  flag_state: number | null
  kind: 'race' | 'pre_race' | 'trivia'
  note: string
  driver_ids: number[]
}

export interface StageResult {
  stage: number
  driver_id: number
  car_number: number | null
  position: number | null
  points: number | null
}

export interface ReplayBundle {
  race: RaceDetail
  finished: boolean
  /** All of the race's data is loaded, so the bundle won't change. */
  complete: boolean
  drivers: ReplayDriver[]
  laps: DriverLaps[]
  lap_flags: number[]
  cautions: Caution[]
  leaders: Leader[]
  pit_stops: PitStop[]
  penalties: Penalty[]
  notes: LapNote[]
  stage_results: StageResult[]
}

export type PlayoffFormat = 'none' | 'elimination' | 'chase'

/** One driver's standing after each race. Index i is `SeasonStandings.races[i]`. */
export interface DriverSeason {
  driver_id: number
  name: string
  car_number: number | null
  is_rookie: boolean
  positions: (number | null)[]
  points: (number | null)[]
  earned: (number | null)[]
  gap_to_leader: (number | null)[]
  wins: (number | null)[]
  top_5: (number | null)[]
  top_10: (number | null)[]
  in_playoffs: (boolean | null)[]
  playoff_seed: number | null
  playoff_start_points: number | null
}

export interface SeasonStandings {
  season: number
  series_id: number
  format: PlayoffFormat
  playoff_field: number
  /** Points races in date order. */
  races: RaceSummary[]
  /** How many of `races` have standings. */
  standings_through: number
  /** In the order of the latest standings. */
  drivers: DriverSeason[]
  regular_season_champion_id: number | null
  champion_id: number | null
}

/** Results across a set of points-race starts. */
export interface StatRecord {
  starts: number
  wins: number
  /** Top 3 finishes. */
  podiums: number
  top_5: number
  top_10: number
  poles: number
  pole_wins: number
  laps_led: number
  laps_completed: number
  /** Starts in which the car led at least one lap. */
  races_led: number
  dnfs: number
  crashes: number
  avg_start: number | null
  avg_finish: number | null
  /** Starting position of the win that came from furthest back. */
  deepest_win_start: number | null
}

export interface FastLap {
  speed_mph: number
  lap: number
  race_id: number
  race_name: string | null
  season: number
  track_name: string | null
  driver_id: number
  driver_name: string | null
}

export interface ChampionshipFinish {
  season: number
  position: number
  driver_id: number
  driver_name: string | null
}

export interface SeasonRecord {
  season: number
  record: StatRecord
  championship: ChampionshipFinish | null
  teams: string[]
}

export interface DriverRecord {
  driver_id: number
  name: string | null
  record: StatRecord
}

export interface TeamRecord {
  slug: string
  name: string
  record: StatRecord
}

export interface TrackRecord {
  track_id: number
  name: string | null
  record: StatRecord
}

export interface Coverage {
  series_id: number
  /** The earliest season with results in the series. */
  data_since: number | null
}

export interface DriverSummary extends DriverRecord {
  first_season: number
  last_season: number
  team: string | null
}

export interface DriverList extends Coverage {
  drivers: DriverSummary[]
}

export interface DriverProfile extends Coverage {
  driver_id: number
  name: string | null
  /** The team of the driver's most recent start. */
  team: string | null
  series_ids: number[]
  first_season: number
  last_season: number
  record: StatRecord
  championships: ChampionshipFinish[]
  best_championship: ChampionshipFinish | null
  stage_wins: number
  fastest_lap: FastLap | null
  seasons: SeasonRecord[]
  teams: TeamRecord[]
  tracks: TrackRecord[]
}

export interface TeamSummary extends TeamRecord {
  first_season: number
  last_season: number
  drivers: number
}

export interface TeamList extends Coverage {
  teams: TeamSummary[]
}

export interface MakeStarts {
  make: string
  starts: number
}

export interface TeamProfile extends Coverage {
  slug: string
  name: string
  series_ids: number[]
  first_season: number
  last_season: number
  record: StatRecord
  championships: ChampionshipFinish[]
  best_championship: ChampionshipFinish | null
  fastest_lap: FastLap | null
  seasons: SeasonRecord[]
  drivers: DriverRecord[]
  makes: MakeStarts[]
}

export interface FastestRace {
  race_id: number
  race_name: string | null
  season: number
  average_speed: number
}

export interface TrackSummary {
  track_id: number
  name: string | null
  races: number
  first_season: number
  last_season: number
  length_mi: number | null
}

export interface TrackList extends Coverage {
  tracks: TrackSummary[]
}

export interface TrackProfile extends Coverage {
  track_id: number
  name: string | null
  series_ids: number[]
  races: number
  first_season: number
  last_season: number
  length_mi: number | null
  avg_cautions: number | null
  avg_caution_laps: number | null
  avg_lead_changes: number | null
  avg_leaders: number | null
  fastest_race: FastestRace | null
  fastest_lap: FastLap | null
  record: StatRecord
  drivers: DriverRecord[]
  teams: TeamRecord[]
  /** Points races at the track, newest first. */
  race_list: RaceSummary[]
}
