// Turns a replay bundle into a timeline the replay can be sampled from.
//
// The data is lap-level: each car's time for each lap. Summing those gives the
// moment each car crossed the line on each lap (`cross`), and the replay
// interpolates between crossings. Race time t is seconds since the green flag,
// the same clock the pit stop times use.

import type { Caution, Penalty, PitStop, RaceDetail, ReplayBundle, ReplayDriver } from '../../../api/types'
import { FLAG } from '../../../lib/racing'

/** Distance between grid rows, in miles (about 10 m), for laying out the start. */
const GRID_ROW_MI = 0.006
/** Fallback track length when the race has no distance (only for the grid layout). */
const DEFAULT_TRACK_MI = 1.5

export interface PitWindow {
  /** Pit road entry and exit, seconds since green. */
  start: number
  end: number
  stop: PitStop
  /** When the car stopped in, and left, its box (null for a drive-through). */
  boxIn: number | null
  boxOut: number | null
}

/** Box arrival and departure, from the box timestamps or else the travel times. */
export function boxTimes(p: PitStop, start: number, end: number): { boxIn: number | null; boxOut: number | null } {
  const valid = (bi: number, bo: number) => bi >= start && bo <= end && bo >= bi
  if (p.box_in_time != null && p.box_out_time != null && valid(p.box_in_time, p.box_out_time))
    return { boxIn: p.box_in_time, boxOut: p.box_out_time }
  if (p.in_travel != null && p.out_travel != null) {
    const bi = start + p.in_travel
    const bo = end - p.out_travel
    if (valid(bi, bo)) return { boxIn: bi, boxOut: bo }
  }
  return { boxIn: null, boxOut: null }
}

export type PitPhase = 'in' | 'stopped' | 'out' | 'drive'

export interface PitProgress {
  phase: PitPhase
  /** 0..1 along pit road, entry to exit. */
  f: number
  /** Seconds stopped so far (0 unless stopped or past the box). */
  stopped: number
}

/**
 * Where a car is on pit road at time t: driving to its box at a steady
 * speed, stopped, then driving to the exit. The box position along pit road
 * comes from the split between the drive in and the drive out.
 */
export function pitProgress(w: PitWindow, t: number): PitProgress {
  const span = Math.max(0.001, w.end - w.start)
  if (w.boxIn == null || w.boxOut == null) {
    return { phase: 'drive', f: clamp01((t - w.start) / span), stopped: 0 }
  }
  const driveIn = w.boxIn - w.start
  const driveOut = w.end - w.boxOut
  const box = driveIn + driveOut > 0 ? driveIn / (driveIn + driveOut) : 0.5
  if (t < w.boxIn) return { phase: 'in', f: driveIn > 0 ? box * clamp01((t - w.start) / driveIn) : box, stopped: 0 }
  if (t <= w.boxOut) return { phase: 'stopped', f: box, stopped: t - w.boxIn }
  return {
    phase: 'out',
    f: box + (1 - box) * (driveOut > 0 ? clamp01((t - w.boxOut) / driveOut) : 1),
    stopped: w.boxOut - w.boxIn,
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/** Seconds a car spends moving on pit road (the window less the stop). */
export function pitMovingTime(w: PitWindow): number {
  const stopped = w.boxIn != null && w.boxOut != null ? w.boxOut - w.boxIn : 0
  return Math.max(1, w.end - w.start - stopped)
}

/**
 * Where cars cross the start/finish line relative to pit road, as a fraction
 * of pit road's length: a median over every stop. A car crossing on pit road
 * gives its share of the moving time done by then; one crossing just after
 * the exit (or just before the entry) gives how far beyond, in the same units.
 */
export function pitLineFraction(cars: CarModel[]): number | null {
  const samples: number[] = []
  for (const car of cars) {
    for (const w of car.pits) {
      const moving = pitMovingTime(w)
      if (moving < 3) continue
      const i = lastAtOrBefore(car.cross, w.end)
      const inside = i >= 1 && car.cross[i] >= w.start ? car.cross[i] : null
      if (inside != null) {
        let stoppedBefore = 0
        if (w.boxIn != null && w.boxOut != null) stoppedBefore = Math.max(0, Math.min(inside, w.boxOut) - w.boxIn)
        samples.push((inside - w.start - stoppedBefore) / moving)
        continue
      }
      const next = car.cross[i + 1]
      const prev = i >= 1 ? car.cross[i] : null
      const lap = car.times[i + 1] ?? 60
      // Only crossings close to pit road say anything about where the line is.
      if (next != null && next - w.end < lap * 0.25) samples.push(1 + (next - w.end) / moving)
      else if (prev != null && w.start - prev < lap * 0.25) samples.push(-(w.start - prev) / moving)
    }
  }
  if (samples.length < 5) return null
  return median(samples)
}

export interface CarModel {
  driverId: number
  car: number | null
  label: string
  name: string
  make: string | null
  team: string | null
  sponsor: string | null
  startPos: number | null
  finishPos: number | null
  finishingStatus: string | null
  /** Seconds since green when the car completed lap n. cross[0] = 0. */
  cross: number[]
  /** Lap times with gaps filled, index = lap. times[0] = 0. */
  times: number[]
  /** Lap times as recorded (null where the feed has none). */
  rawTimes: (number | null)[]
  /** Official running position at each line crossing. */
  positions: (number | null)[]
  /** Laps the car completed. */
  lastLap: number
  /** Best recorded lap through lap n (Infinity before any). */
  bestUpTo: number[]
  /** How far behind the line the car starts, in laps. */
  gridOffset: number
  /** 0 inside, 1 outside. */
  gridLane: number
  pits: PitWindow[]
}

export type EventKind = 'flag' | 'lead' | 'penalty' | 'served' | 'note' | 'stage'

export interface RaceEvent {
  id: string
  t: number
  lap: number
  kind: EventKind
  flag?: number
  cars: number[]
  title: string
  text?: string
}

export interface PenaltyTiming {
  penalty: Penalty
  given: number
  /** When it was served, or null when the data doesn't show it. */
  served: number | null
}

export interface RaceModel {
  race: RaceDetail
  cars: CarModel[]
  byCar: Map<number, CarModel>
  byDriver: Map<number, CarModel>
  totalLaps: number
  /** leaderCross[n]: when the first car completed lap n. */
  leaderCross: number[]
  finishTime: number
  duration: number
  lapFlags: number[]
  stageEnds: number[]
  cautions: Caution[]
  events: RaceEvent[]
  penalties: PenaltyTiming[]
  /** Median lap time across the field, index = lap. */
  fieldLapTime: (number | null)[]
  /**
   * Where the start/finish line sits along pit road, measured from this
   * race's timing: 0 at pit entry, 1 at pit exit, beyond either end when the
   * line is off pit road (at Talladega it's past the exit). Null without
   * enough pit stops to tell.
   */
  pitLine: number | null
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

/** The largest n with arr[n] <= t (arr ascending), or -1. */
export function lastAtOrBefore(arr: ArrayLike<number>, t: number): number {
  let lo = 0
  let hi = arr.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= t) {
      ans = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  return ans
}

function carLabel(d: ReplayDriver): string {
  return d.car_number == null ? '?' : String(d.car_number)
}

export function buildModel(bundle: ReplayBundle): RaceModel {
  const { race } = bundle
  const lapsByDriver = new Map(bundle.laps.map((l) => [l.driver_id, l]))

  // Every car's recorded lap times, indexed by lap number.
  const raw = new Map<number, (number | null)[]>()
  let maxLap = 0
  for (const d of bundle.drivers) {
    const laps = lapsByDriver.get(d.driver_id)
    const times = laps?.times ?? []
    raw.set(d.driver_id, times)
    maxLap = Math.max(maxLap, times.length - 1)
  }

  // Median time per lap across the field, to fill holes in one car's record.
  const lapMedian: (number | null)[] = []
  for (let n = 1; n <= maxLap; n++) {
    const values: number[] = []
    for (const times of raw.values()) {
      const v = times[n]
      if (v != null && v > 0) values.push(v)
    }
    lapMedian[n] = median(values)
  }

  const trackMi = race.track_length_mi || DEFAULT_TRACK_MI
  const rowGap = GRID_ROW_MI / trackMi

  const pitsByCar = new Map<number, PitStop[]>()
  for (const p of bundle.pit_stops) {
    if (!pitsByCar.has(p.car_number)) pitsByCar.set(p.car_number, [])
    pitsByCar.get(p.car_number)!.push(p)
  }

  const cars: CarModel[] = bundle.drivers.map((d) => {
    const rawTimes = raw.get(d.driver_id) ?? []
    const laps = lapsByDriver.get(d.driver_id)
    const positions = laps?.positions ?? []

    let lastLap = 0
    for (let n = rawTimes.length - 1; n >= 1; n--) {
      if (rawTimes[n] != null) {
        lastLap = n
        break
      }
    }
    const times = [0]
    const cross = [0]
    const bestUpTo = [Infinity]
    let prev = lapMedian[1] ?? 30
    for (let n = 1; n <= lastLap; n++) {
      const t = rawTimes[n] ?? lapMedian[n] ?? prev
      times[n] = t
      cross[n] = cross[n - 1] + t
      prev = t
      const r = rawTimes[n]
      bestUpTo[n] = Math.min(bestUpTo[n - 1], r != null && r > 0 ? r : Infinity)
    }

    const gridPos = positions[0] ?? d.start_pos ?? bundle.drivers.length
    const row = Math.floor((gridPos - 1) / 2)
    const end = cross[lastLap]
    const pits: PitWindow[] = (d.car_number != null ? (pitsByCar.get(d.car_number) ?? []) : [])
      // Stops logged before the green (in_time 0) or after the car's last lap
      // (the cool-down) aren't part of the race.
      .filter((p) => p.in_time > 0 && p.in_time < end)
      .map((p) => {
        const start = p.in_time
        const end =
          p.out_time && p.out_time > p.in_time
            ? p.out_time
            : p.in_time + (p.total_duration && p.total_duration > 0 ? p.total_duration : 30)
        return { start, end, stop: p, ...boxTimes(p, start, end) }
      })

    return {
      driverId: d.driver_id,
      car: d.car_number,
      label: carLabel(d),
      name: d.name ?? '',
      make: d.manufacturer,
      team: d.team,
      sponsor: d.sponsor,
      startPos: d.start_pos ?? positions[0] ?? null,
      finishPos: d.finish_pos,
      finishingStatus: d.finishing_status,
      cross,
      times,
      rawTimes,
      positions,
      lastLap,
      bestUpTo,
      gridOffset: row * rowGap,
      gridLane: (gridPos - 1) % 2,
      pits,
    }
  })

  const totalLaps = Math.max(race.actual_laps ?? 0, ...cars.map((c) => c.lastLap), 0)
  const leaderCross: number[] = [0]
  for (let n = 1; n <= totalLaps; n++) {
    let best = Infinity
    for (const c of cars) if (c.lastLap >= n) best = Math.min(best, c.cross[n])
    // Laps no car has run yet (a live race) get projected from the last one.
    leaderCross[n] = Number.isFinite(best)
      ? best
      : leaderCross[n - 1] + (lapMedian[n - 1] ?? lapMedian[1] ?? 30)
  }
  const finishTime = leaderCross[totalLaps] ?? 0
  const duration = Math.max(finishTime, ...cars.map((c) => c.cross[c.lastLap])) + 3

  const lapFlags = bundle.lap_flags.length ? bundle.lap_flags : [FLAG.GREEN]
  const model: RaceModel = {
    race,
    cars,
    byCar: new Map(cars.filter((c) => c.car != null).map((c) => [c.car!, c])),
    byDriver: new Map(cars.map((c) => [c.driverId, c])),
    totalLaps,
    leaderCross,
    finishTime,
    duration,
    lapFlags,
    stageEnds: race.stage_ends,
    cautions: bundle.cautions,
    events: [],
    penalties: [],
    fieldLapTime: lapMedian,
    pitLine: null,
  }
  model.pitLine = pitLineFraction(cars)
  model.penalties = bundle.penalties.map((p) => penaltyTiming(model, p))
  model.events = buildEvents(model, bundle)
  return model
}

/** When a penalty was given (midway through its lap) and when it was served. */
function penaltyTiming(model: RaceModel, penalty: Penalty): PenaltyTiming {
  return { penalty, given: lapMidTime(model, penalty.lap), served: servedTime(model, penalty) }
}

/** The start of the pit stop that served it, the restart, or else midway through the lap. */
function servedTime(model: RaceModel, p: Penalty): number | null {
  if (p.served_lap == null) return null
  if (p.served_how === 'pit_stop') {
    const stop = model.byCar.get(p.car_number)?.pits.find((w) => w.stop.lap === p.served_lap)
    if (stop) return stop.start
  }
  return p.served_how === 'restart' ? lapStartTime(model, p.served_lap) : lapMidTime(model, p.served_lap)
}

/** When the leader started lap `lap` (lap 1 starts at the green). */
export function lapStartTime(model: RaceModel, lap: number): number {
  if (lap <= 1) return 0
  return model.leaderCross[Math.min(lap - 1, model.totalLaps)] ?? model.finishTime
}

/** Midway through the leader's lap `lap`: when a note about that lap shows up. */
export function lapMidTime(model: RaceModel, lap: number): number {
  if (lap <= 0) return -1
  const start = lapStartTime(model, lap)
  const end = model.leaderCross[Math.min(lap, model.totalLaps)] ?? start
  return start + (end - start) / 2
}

function buildEvents(model: RaceModel, bundle: ReplayBundle): RaceEvent[] {
  const events: RaceEvent[] = []
  const flags = model.lapFlags

  // Flag changes, with the caution's reason where the segments give one.
  for (let lap = 1; lap < flags.length; lap++) {
    const prev = lap === 1 ? FLAG.GREEN : flags[lap - 1]
    const cur = flags[lap]
    if (cur === prev || cur === FLAG.WHITE) continue
    const caution = bundle.cautions.find((c) => Math.abs(c.start_lap - lap) <= 1)
    const t = lapStartTime(model, lap)
    if (cur === FLAG.YELLOW || cur === FLAG.RED) {
      const reason = [caution?.reason, caution?.comment].filter(Boolean).join(' · ')
      events.push({
        id: `flag-${lap}`,
        t,
        lap,
        kind: 'flag',
        flag: cur,
        cars: [],
        title: cur === FLAG.RED ? 'Red flag' : 'Caution',
        text: reason || undefined,
      })
    } else if (cur === FLAG.GREEN && (prev === FLAG.YELLOW || prev === FLAG.RED)) {
      events.push({ id: `flag-${lap}`, t, lap, kind: 'flag', flag: cur, cars: [], title: 'Green flag' })
    }
  }

  events.push({
    id: 'start',
    t: 0,
    lap: 1,
    kind: 'flag',
    flag: FLAG.GREEN,
    cars: [],
    title: 'Green flag',
    text: model.race.race_name ?? undefined,
  })
  if (model.totalLaps > 0 && bundle.finished) {
    const winner = model.cars.find((c) => c.finishPos === 1)
    events.push({
      id: 'finish',
      t: model.finishTime,
      lap: model.totalLaps,
      kind: 'flag',
      flag: FLAG.CHECKERED,
      cars: winner?.car != null ? [winner.car] : [],
      title: 'Checkered flag',
      text: winner ? `#${winner.label} ${winner.name} wins` : undefined,
    })
  }

  for (const l of bundle.leaders) {
    if (l.start_lap <= 1) continue
    const c = model.byCar.get(l.car_number)
    events.push({
      id: `lead-${l.start_lap}-${l.car_number}`,
      t: lapStartTime(model, l.start_lap),
      lap: l.start_lap,
      kind: 'lead',
      cars: [l.car_number],
      title: `#${l.car_number} takes the lead`,
      text: c?.name,
    })
  }

  for (const [i, end] of model.stageEnds.entries()) {
    if (end >= model.totalLaps) continue
    const top = bundle.stage_results
      .filter((s) => s.stage === i + 1)
      .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))[0]
    const winner = top ? model.byDriver.get(top.driver_id) : undefined
    events.push({
      id: `stage-${i + 1}`,
      t: model.leaderCross[end] ?? 0,
      lap: end,
      kind: 'stage',
      cars: winner?.car != null ? [winner.car] : [],
      title: `End of Stage ${i + 1}`,
      text: winner ? `#${winner.label} ${winner.name} wins the stage` : undefined,
    })
  }

  for (const { penalty: p, given, served } of model.penalties) {
    const what = [p.infraction, p.penalty].filter(Boolean).join(' · ')
    events.push({
      id: `pen-${p.id}`,
      t: given,
      lap: p.lap,
      kind: 'penalty',
      cars: [p.car_number],
      title: `Penalty #${p.car_number}`,
      text: what,
    })
    if (served != null && p.served_lap != null) {
      events.push({
        id: `served-${p.id}`,
        t: served,
        lap: p.served_lap,
        kind: 'served',
        cars: [p.car_number],
        title: `#${p.car_number} serves penalty`,
        text: [p.penalty ?? p.infraction, servedHowText(p.served_how)].filter(Boolean).join(' · '),
      })
    }
  }

  for (const n of bundle.notes) {
    if (n.kind === 'trivia') continue
    const cars = n.driver_ids
      .map((id) => model.byDriver.get(id)?.car)
      .filter((c): c is number => c != null)
    events.push({
      id: `note-${n.lap}-${n.note_id}`,
      t: n.kind === 'pre_race' ? -1 : lapMidTime(model, n.lap),
      lap: n.lap,
      kind: 'note',
      cars: [...new Set(cars)],
      title: n.kind === 'pre_race' ? 'Pre-race' : `Lap ${n.lap}`,
      text: n.note,
    })
  }

  return events.sort((a, b) => a.t - b.t || kindOrder(a.kind) - kindOrder(b.kind))
}

function kindOrder(kind: EventKind): number {
  return ['flag', 'stage', 'lead', 'penalty', 'served', 'note'].indexOf(kind)
}

export function servedHowText(how: string | null): string | null {
  switch (how) {
    case 'pit_stop':
      return 'on pit road'
    case 'restart':
      return 'at the restart'
    case 'lap_note':
      return null
    default:
      return null
  }
}
