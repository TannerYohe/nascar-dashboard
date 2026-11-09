// Builders for engine test data.

import type { PitStop } from '../../../api/types'

/** A pit stop from `inTime` to `outTime` with no tires and no box times, unless overridden. */
export function pitStop(car: number, inTime: number, outTime: number, overrides: Partial<PitStop> = {}): PitStop {
  return {
    car_number: car,
    driver_name: null,
    lap: null,
    leader_lap: null,
    note_lap: null,
    in_time: inTime,
    out_time: outTime,
    box_in_time: null,
    box_out_time: null,
    stop_duration: null,
    in_travel: null,
    out_travel: null,
    total_duration: outTime - inTime,
    stop_type: 'OTHER',
    tires: [],
    in_flag: 1,
    out_flag: 1,
    in_rank: null,
    out_rank: null,
    positions_gained: null,
    infraction: null,
    ...overrides,
  }
}
