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
  lap: number | null
  leader_lap: number | null
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
