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
  start: number
  end: number
  stop: PitStop
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
  const offset = bundle.from_lap

  // Every car's recorded lap times, indexed by absolute lap number.
  const raw = new Map<number, (number | null)[]>()
  let maxLap = 0
  for (const d of bundle.drivers) {
    const laps = lapsByDriver.get(d.driver_id)
    const times: (number | null)[] = []
    if (laps) laps.times.forEach((t, i) => (times[i + offset] = t))
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
    const positions: (number | null)[] = []
    laps?.positions.forEach((p, i) => (positions[i + offset] = p))

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
      .map((p) => ({
        start: p.in_time,
        end:
          p.out_time && p.out_time > p.in_time
            ? p.out_time
            : p.in_time + (p.total_duration && p.total_duration > 0 ? p.total_duration : 30),
        stop: p,
      }))

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
  }
  model.events = buildEvents(model, bundle)
  const eventTime = new Map(model.events.map((e) => [e.id, e.t]))
  model.penalties = bundle.penalties.map((p) => ({
    penalty: p,
    given: eventTime.get(`pen-${p.id}`) ?? 0,
    served: eventTime.get(`served-${p.id}`) ?? null,
  }))
  return model
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

  for (const p of bundle.penalties) {
    const what = [p.infraction, p.penalty].filter(Boolean).join(' · ')
    events.push({
      id: `pen-${p.id}`,
      t: lapMidTime(model, p.lap),
      lap: p.lap,
      kind: 'penalty',
      cars: [p.car_number],
      title: `Penalty #${p.car_number}`,
      text: what,
    })
    if (p.served_lap != null) {
      const stop =
        p.served_how === 'pit_stop'
          ? model.byCar.get(p.car_number)?.pits.find((w) => w.stop.lap === p.served_lap)
          : undefined
      events.push({
        id: `served-${p.id}`,
        t: stop ? stop.start : p.served_how === 'restart' ? lapStartTime(model, p.served_lap) : lapMidTime(model, p.served_lap),
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
