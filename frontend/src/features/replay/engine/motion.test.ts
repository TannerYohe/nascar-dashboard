import { describe, expect, it } from 'vitest'

import type { PitStop, ReplayBundle } from '../../../api/types'
import { buildModel, pitLineFraction, pitProgress, type RaceModel } from './model'
import { buildMotion, eased, placementAt } from './motion'

function stop(car: number, inTime: number, outTime: number, box?: [number, number]): PitStop {
  return {
    car_number: car,
    driver_name: null,
    lap: null,
    leader_lap: null,
    in_time: inTime,
    out_time: outTime,
    box_in_time: box?.[0] ?? null,
    box_out_time: box?.[1] ?? null,
    stop_duration: box ? box[1] - box[0] : null,
    in_travel: null,
    out_travel: null,
    total_duration: outTime - inTime,
    stop_type: 'FOUR_WHEEL_CHANGE',
    tires: [],
    in_flag: 1,
    out_flag: 1,
    in_rank: null,
    out_rank: null,
    positions_gained: null,
    infraction: null,
  }
}

/** One car, 30-second laps, with a slow lap 3 holding a pit stop. */
function model(times: (number | null)[], pits: PitStop[]): RaceModel {
  const bundle = {
    race: { track_length_mi: 1.5, actual_laps: times.length - 1, stage_ends: [] },
    finished: true,
    from_lap: 0,
    drivers: [
      {
        driver_id: 1,
        car_number: 9,
        name: 'Nine',
        manufacturer: null,
        team: null,
        sponsor: null,
        start_pos: 1,
        finish_pos: 1,
        finishing_status: 'Running',
        laps_led: null,
      },
    ],
    laps: [{ driver_id: 1, times, positions: times.map(() => 1) }],
    lap_flags: times.map(() => 1),
    cautions: [],
    leaders: [],
    pit_stops: pits,
    penalties: [],
    notes: [],
    stage_results: [],
  } as unknown as ReplayBundle
  return buildModel(bundle)
}

describe('eased', () => {
  it('starts and ends where it should and never goes backwards', () => {
    for (const mode of ['in', 'out'] as const) {
      let prev = -1
      for (let tau = 0; tau <= 25; tau += 0.25) {
        const s = eased(tau, 25, 0.8, 1 / 30, 1 / 90, mode)
        expect(s).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = s
      }
      expect(eased(0, 25, 0.8, 1 / 30, 1 / 90, mode)).toBeCloseTo(0)
      expect(eased(25, 25, 0.8, 1 / 30, 1 / 90, mode)).toBeCloseTo(0.8)
    }
  })

  it('runs an in-lap at full pace before braking', () => {
    // 0.8 of a lap in 25 s at a 30 s pace: the first 10 s are at race speed.
    expect(eased(10, 25, 0.8, 1 / 30, 1 / 90, 'in')).toBeCloseTo(10 / 30)
  })

  it('falls back to a steady speed when no slowdown fits', () => {
    expect(eased(5, 10, 0.5, 1 / 30, 1 / 90, 'in')).toBeCloseTo(0.25)
  })
})

describe('pitProgress', () => {
  const m = model([null, 30, 30, 50, 30], [stop(9, 70, 100, [80, 90])])
  const w = m.cars[0].pits[0]

  it('drives in, stops, and drives out', () => {
    expect(pitProgress(w, 75)).toMatchObject({ phase: 'in', f: 0.25 })
    expect(pitProgress(w, 85)).toMatchObject({ phase: 'stopped', f: 0.5, stopped: 5 })
    expect(pitProgress(w, 95)).toMatchObject({ phase: 'out', f: 0.75 })
  })
})

describe('start/finish from timing', () => {
  it('finds the line past pit exit when cars cross just after leaving', () => {
    // Lap 3 ends at 110, two seconds after pit exit at 108.
    const pits = [1, 2, 3, 4, 5].map(() => stop(9, 78, 108, [88, 98]))
    const m = model([null, 30, 30, 50, 30], pits)
    expect(pitLineFraction(m.cars)).toBeCloseTo(1 + 2 / 20)
  })

  it('finds the line on pit road from where crossings fall', () => {
    // Crossing at 110 on a stop from 100 to 120, box 112-116: 10 of 16 moving seconds in.
    const pits = [1, 2, 3, 4, 5].map(() => stop(9, 100, 120, [112, 116]))
    const m = model([null, 30, 30, 50, 30], pits)
    expect(pitLineFraction(m.cars)).toBeCloseTo(10 / 16)
  })
})

describe('motion', () => {
  it('reaches pit entry at pit-in and pit exit at pit-out when the line is after pit road', () => {
    // Crossings at 30, 60, 110, 140. Pit road from 0.8 to 0.95 of the lap, stop 80-100.
    const m = model([null, 30, 30, 50, 30], [stop(9, 80, 100, [86, 94])])
    const motion = buildMotion(m, { entry: 0.8, exit: 0.95 }).get(1)!
    expect(placementAt(motion, 60)).toEqual({ on: 'track', progress: 2 })
    expect(placementAt(motion, 79.999).on).toBe('track')
    const atIn = placementAt(motion, 79.999)
    expect(atIn.on === 'track' && atIn.progress).toBeCloseTo(2.8, 3)
    expect(placementAt(motion, 90)).toMatchObject({ on: 'pit', progress: { phase: 'stopped' } })
    const out = placementAt(motion, 100.001)
    expect(out.on === 'track' && out.progress).toBeCloseTo(2.95, 3)
    expect(placementAt(motion, 110)).toEqual({ on: 'track', progress: 3 })
  })

  it('drops a line crossing made on pit road', () => {
    // Line mid pit road: crossing at 110 falls inside the 100-120 stop.
    const m = model([null, 30, 30, 50, 30, 30], [stop(9, 100, 120)])
    const motion = buildMotion(m, { entry: 0.9, exit: 0.1 }).get(1)!
    expect(placementAt(motion, 110).on).toBe('pit')
    const after = placementAt(motion, 120.001)
    expect(after.on === 'track' && after.progress).toBeCloseTo(3.1, 3)
    expect(placementAt(motion, 140)).toEqual({ on: 'track', progress: 4 })
  })

  it('moves at a steady speed on laps without a stop', () => {
    const m = model([null, 30, 30, 30], [])
    const motion = buildMotion(m, { entry: 0.9, exit: 0.1 }).get(1)!
    const at = placementAt(motion, 45)
    expect(at.on === 'track' && at.progress).toBeCloseTo(1.5)
  })
})
