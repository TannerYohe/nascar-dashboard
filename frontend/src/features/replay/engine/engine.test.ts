import { describe, expect, it } from 'vitest'

import type { Penalty, ReplayBundle, ReplayDriver } from '../../../api/types'
import { pitStop } from './fixtures'
import { buildModel, lapMidTime, lapSeekTime, lastAtOrBefore, penaltyStatusAt } from './model'
import { frameAt, lapsAt, progressAt, raceStateAt, standingsAt } from './snapshot'

function driver(id: number, car: number, start: number, finish: number, make = 'Ford'): ReplayDriver {
  return {
    driver_id: id,
    car_number: car,
    name: `Driver ${car}`,
    manufacturer: make,
    team: null,
    sponsor: null,
    start_pos: start,
    finish_pos: finish,
    finishing_status: 'Running',
    laps_led: null,
  }
}

function bundle(overrides: Partial<ReplayBundle> = {}): ReplayBundle {
  return {
    race: {
      race_id: 1,
      series_id: 1,
      season: 2025,
      race_name: 'Test',
      track_id: 1,
      track_name: 'Test',
      race_date: null,
      round: 1,
      is_exhibition: false,
      playoff_round: null,
      scheduled_laps: 4,
      actual_laps: 4,
      winner: null,
      has_lap_data: true,
      status: 'finished',
      stage_ends: [2, 4],
      track_length_mi: 1.5,
      scheduled_distance: 6,
      number_of_cautions: 0,
      number_of_caution_laps: 0,
      number_of_lead_changes: 0,
      number_of_leaders: 1,
      average_speed: null,
      margin_of_victory: null,
      total_race_time: null,
      television_broadcaster: null,
    },
    finished: true,
    complete: true,
    // Car 1 leads every lap; car 2 is a second back; car 3 drops out after lap 2;
    // car 4 is a lap down by the end.
    drivers: [driver(1, 1, 2, 1), driver(2, 2, 1, 2), driver(3, 3, 3, 4), driver(4, 4, 4, 3)],
    laps: [
      { driver_id: 1, times: [null, 30, 30, 30, 30], positions: [2, 1, 1, 1, 1] },
      { driver_id: 2, times: [null, 31, 30, 30, 30], positions: [1, 2, 2, 2, 2] },
      { driver_id: 3, times: [null, 32, null, null], positions: [3, 3, 3] },
      { driver_id: 4, times: [null, 40, 40, 40], positions: [4, 4, 4, 4] },
    ],
    lap_flags: [1, 1, 2, 1, 4],
    cautions: [],
    leaders: [],
    pit_stops: [],
    penalties: [],
    notes: [],
    stage_results: [],
    ...overrides,
  }
}

describe('lastAtOrBefore', () => {
  it('finds the last index at or before t', () => {
    expect(lastAtOrBefore([0, 10, 20], -1)).toBe(-1)
    expect(lastAtOrBefore([0, 10, 20], 0)).toBe(0)
    expect(lastAtOrBefore([0, 10, 20], 15)).toBe(1)
    expect(lastAtOrBefore([0, 10, 20], 99)).toBe(2)
  })
})

describe('buildModel', () => {
  const model = buildModel(bundle())

  it('sums lap times into line crossings', () => {
    expect(model.byCar.get(1)!.cross).toEqual([0, 30, 60, 90, 120])
    expect(model.byCar.get(4)!.cross).toEqual([0, 40, 80, 120])
  })

  it('fills a missing lap time from the field and stops at the last recorded lap', () => {
    const car3 = model.byCar.get(3)!
    // Lap 2 has no time but no later lap has one either, so the car stopped at lap 1.
    expect(car3.lastLap).toBe(1)
  })

  it('fills gaps in the middle of a run with the median of the field', () => {
    const m = buildModel(
      bundle({
        laps: [
          { driver_id: 1, times: [null, 30, null, 30], positions: [] },
          { driver_id: 2, times: [null, 31, 32, 30], positions: [] },
          { driver_id: 3, times: [null, 32, 34, 30], positions: [] },
          { driver_id: 4, times: [null, 40, 40, 40], positions: [] },
        ],
      }),
    )
    expect(m.byCar.get(1)!.times[2]).toBe(34) // median of 32, 34, 40
  })

  it('tracks the leader crossing each lap', () => {
    expect(model.leaderCross).toEqual([0, 30, 60, 90, 120])
    expect(model.finishTime).toBe(120)
  })

  it('places notes midway through the leader lap', () => {
    expect(lapMidTime(model, 2)).toBe(45)
  })

  it('seeks just past the start of a lap, kept inside the race', () => {
    expect(lapSeekTime(model, 3)).toBeCloseTo(60.01)
    expect(lapSeekTime(model, 0)).toBeCloseTo(0.01)
    expect(lapSeekTime(model, 99)).toBe(lapSeekTime(model, model.totalLaps))
  })
})

describe('positions over time', () => {
  const model = buildModel(bundle())
  const car1 = model.byCar.get(1)!
  const car2 = model.byCar.get(2)!

  it('interpolates within a lap', () => {
    expect(lapsAt(car1, 45)).toBe(1)
    expect(progressAt(car1, 45)).toBeCloseTo(1.5)
  })

  it('starts the grid behind the line and reaches it on the first crossing', () => {
    expect(progressAt(car2, 0)).toBe(0) // pole sits on the line
    expect(progressAt(car1, 0)).toBe(0) // front row, outside lane
    const car4 = model.byCar.get(4)!
    expect(progressAt(car4, 0)).toBeLessThan(0) // second row
    expect(progressAt(car4, 40)).toBe(1)
  })

  it('marks cars out after their last lap and finished after the checkered', () => {
    expect(frameAt(model.byCar.get(3)!, 50, model.finishTime).status).toBe('out')
    expect(frameAt(car1, 121, model.finishTime).status).toBe('finished')
    expect(frameAt(model.byCar.get(4)!, 125, model.finishTime).status).toBe('finished')
  })

  it('shows the pit window', () => {
    const m = buildModel(bundle({ pit_stops: [pitStop(2, 70, 80, { lap: 2, leader_lap: 2 })] }))
    const f = frameAt(m.byCar.get(2)!, 75, m.finishTime)
    expect(f.status).toBe('pit')
    expect(f.pitState?.f).toBeCloseTo(0.5)
  })
})

describe('standings', () => {
  const model = buildModel(bundle())

  it('orders by laps then line crossing, and measures gaps at the line', () => {
    // Car 3 retired after lap 1 (crossed at 32) and stays ahead of car 4 (on
    // lap 1 at 40) until car 4 completes lap 2 at 80.
    expect(standingsAt(model, 65).map((r) => r.frame.car.car)).toEqual([1, 2, 3, 4])
    const rows = standingsAt(model, 85)
    expect(rows.map((r) => r.frame.car.car)).toEqual([1, 2, 4, 3])
    expect(rows[1].gap).toBe(1) // car 2 crossed lap 2 at 61 vs 60
    expect(rows[1].interval).toBe(1)
  })

  it('never reports a negative gap', () => {
    for (let t = 1; t < model.duration; t += 0.5) {
      for (const r of standingsAt(model, t)) {
        if (r.gap != null) expect(r.gap).toBeGreaterThanOrEqual(0)
        if (r.interval != null) expect(r.interval).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('reports laps down', () => {
    const rows = standingsAt(model, 125)
    const car4 = rows.find((r) => r.frame.car.car === 4)!
    expect(car4.lapsDown).toBe(1)
    expect(rows.map((r) => r.frame.car.car)).toEqual([1, 2, 4, 3])
  })

  it('highlights best laps', () => {
    const rows = standingsAt(model, 95)
    const car1 = rows[0]
    expect(car1.lastLap).toBe(30)
    expect(car1.lastIsOverallBest).toBe(true)
  })
})

describe('race state', () => {
  const model = buildModel(bundle())

  it('reports lap, flag and stage', () => {
    expect(raceStateAt(model, 45)).toMatchObject({ lap: 2, flag: 2, stage: 1, lapsToGo: 3 })
    expect(raceStateAt(model, 95)).toMatchObject({ lap: 4, flag: 4, stage: 2 })
    expect(raceStateAt(model, 130)).toMatchObject({ finished: true, flag: 5, lapsToGo: 0 })
  })
})

describe('events', () => {
  const speeding: Penalty = {
    id: 'p1',
    car_number: 2,
    driver_id: 2,
    lap: 1,
    infraction: 'Pit road speeding',
    penalty: 'Pass-through',
    detail: null,
    source: 'lap_note',
    served_lap: 3,
    served_how: 'pit_stop',
  }
  // Leader laps end at 30, 60, 90 and 120. Lap 2 is under caution.
  const model = buildModel(
    bundle({
      cautions: [
        { start_lap: 2, end_lap: 2, flag_state: 2, reason: 'Debris', comment: 'Turn 3', beneficiary_car_number: null },
      ],
      leaders: [
        { start_lap: 1, end_lap: 2, car_number: 1 },
        { start_lap: 3, end_lap: 4, car_number: 2 },
      ],
      pit_stops: [pitStop(2, 70, 80, { lap: 2, leader_lap: 2 })],
      penalties: [speeding],
      notes: [
        { lap: 2, note_id: 1, flag_state: 2, kind: 'race', note: 'Caution for debris.', driver_ids: [] },
        { lap: 0, note_id: 1, flag_state: 9, kind: 'pre_race', note: '#2 to the rear.', driver_ids: [2] },
      ],
    }),
  )
  const byId = (id: string) => model.events.find((e) => e.id === id)

  it('puts the caution and the restart at the start of their laps', () => {
    expect(byId('flag-2')).toMatchObject({ t: 30, title: 'Caution', text: 'Debris · Turn 3' })
    expect(byId('flag-3')).toMatchObject({ t: 60, title: 'Green flag' })
  })

  it('marks a lead change at the start of the lap', () => {
    expect(byId('lead-3-2')).toMatchObject({ t: 60, cars: [2] })
    expect(byId('lead-1-1')).toBeUndefined()
  })

  it('marks stage ends but not the final stage', () => {
    expect(model.stageMarks).toEqual([{ stage: 1, end: 2 }])
    expect(byId('stage-1')).toMatchObject({ t: 60, lap: 2 })
    expect(byId('stage-2')).toBeUndefined()
  })

  it('does not mark the final stage in overtime', () => {
    // Scheduled to finish on lap 3, run to lap 4.
    const overtime = buildModel(bundle({ race: { ...bundle().race, stage_ends: [2, 3] } }))
    expect(overtime.stageMarks).toEqual([{ stage: 1, end: 2 }])
    expect(overtime.events.find((e) => e.id === 'stage-2')).toBeUndefined()
  })

  it('does not mark a stage a shortened race never reached', () => {
    const shortened = buildModel(bundle({ race: { ...bundle().race, stage_ends: [2, 5, 8] } }))
    expect(shortened.stageMarks).toEqual([{ stage: 1, end: 2 }])
  })

  it('times a penalty served on pit road from the stop', () => {
    expect(model.penalties).toEqual([{ penalty: speeding, given: 15, served: 70 }])
    expect(byId('pen-p1')?.t).toBe(15)
    expect(byId('served-p1')?.t).toBe(70)
  })

  it.each([
    { how: 'restart', lap: 3, served: 60, why: 'at the restart, the start of the lap' },
    { how: 'lap_note', lap: 3, served: 75, why: 'from a note, midway through the lap' },
    { how: 'pit_stop', lap: 4, served: 105, why: 'at a pit stop the data lacks, midway through the lap' },
  ] as const)('times a penalty served $why', ({ how, lap, served }) => {
    const m = buildModel(
      bundle({
        pit_stops: [pitStop(2, 70, 80, { lap: 2, leader_lap: 2 })],
        penalties: [{ ...speeding, served_how: how, served_lap: lap }],
      }),
    )
    expect(m.penalties[0].served).toBe(served)
  })

  it('matches the serving stop by leader lap, not the car lap', () => {
    // Car 2 a lap down: its own lap 1 when the leader has done 2, so leader lap 3.
    const lapped = buildModel(
      bundle({ pit_stops: [pitStop(2, 70, 80, { lap: 1, leader_lap: 2 })], penalties: [speeding] }),
    )
    expect(lapped.penalties[0].served).toBe(70)
  })

  it('reports where a penalty stands over time', () => {
    const [timing] = model.penalties
    expect(penaltyStatusAt(timing, 10)).toBeNull()
    expect(penaltyStatusAt(timing, 15)).toBe('pending')
    expect(penaltyStatusAt(timing, 30)).toBe('pending')
    expect(penaltyStatusAt(timing, 70)).toBe('served')
    expect(penaltyStatusAt(timing, 80)).toBe('served')
    const unrecordedPenalty = { ...speeding, served_lap: null, served_how: null }
    const [unrecorded] = buildModel(bundle({ penalties: [unrecordedPenalty] })).penalties
    expect(penaltyStatusAt(unrecorded, 30)).toBe('unrecorded')
  })

  it('shows a pre-race penalty as pending before the green', () => {
    const [preRace] = buildModel(bundle({ penalties: [{ ...speeding, lap: 0 }] })).penalties
    expect(preRace.given).toBe(-1)
    expect(penaltyStatusAt(preRace, -1)).toBe('pending')
    expect(penaltyStatusAt(preRace, 0)).toBe('pending')
  })

  it('sorts the pre-race note first', () => {
    expect(model.events[0]).toMatchObject({ kind: 'note', title: 'Pre-race', cars: [2] })
  })
})
