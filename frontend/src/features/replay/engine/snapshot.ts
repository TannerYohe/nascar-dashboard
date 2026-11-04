// Sampling the race model at a moment in time.

import { FLAG } from '../../../lib/racing'
import { type CarModel, lastAtOrBefore, type PitProgress, pitProgress, type PitWindow, type RaceModel } from './model'

export type CarStatus = 'grid' | 'running' | 'pit' | 'out' | 'finished'

export interface CarFrame {
  car: CarModel
  /** Laps completed. */
  laps: number
  /** Laps completed plus the fraction of the current one (negative on the grid). */
  progress: number
  /** Where on the lap the car is, 0..1 from the start/finish line. */
  lapFraction: number
  status: CarStatus
  pit: PitWindow | null
  /** Where on pit road, and whether driving or stopped, when status is 'pit'. */
  pitState: PitProgress | null
}

/** Laps the car had completed at time t. */
export function lapsAt(car: CarModel, t: number): number {
  if (t <= 0) return 0
  return Math.min(Math.max(0, lastAtOrBefore(car.cross, t)), car.lastLap)
}

export function progressAt(car: CarModel, t: number): number {
  if (t <= 0) return 0 - car.gridOffset
  const n = lapsAt(car, t)
  if (n >= car.lastLap) return car.lastLap
  const frac = Math.min(1, (t - car.cross[n]) / car.times[n + 1])
  // Lap 1 is longer: the car starts behind the line, at its grid slot.
  if (n === 0) return -car.gridOffset + frac * (1 + car.gridOffset)
  return n + frac
}

export function frameAt(car: CarModel, t: number, finishTime: number): CarFrame {
  const laps = lapsAt(car, t)
  const progress = progressAt(car, t)
  const lapFraction = ((progress % 1) + 1) % 1
  let status: CarStatus = 'running'
  let pit: PitWindow | null = null
  let pitState: PitProgress | null = null

  if (t <= 0) status = 'grid'
  else if (car.lastLap === 0 || t >= car.cross[car.lastLap]) {
    // A car still running at the end crosses the line after the leader does.
    status = car.lastLap > 0 && car.cross[car.lastLap] >= finishTime - 0.5 ? 'finished' : 'out'
  } else {
    pit = car.pits.find((w) => w.start <= t && t <= w.end) ?? null
    if (pit) {
      status = 'pit'
      pitState = pitProgress(pit, t)
    }
  }
  return { car, laps, progress, lapFraction, status, pit, pitState }
}

/** Leader laps completed at time t. */
export function leaderLapsAt(model: RaceModel, t: number): number {
  if (t <= 0) return 0
  return Math.max(0, Math.min(model.totalLaps, lastAtOrBefore(model.leaderCross, t)))
}

export interface RaceState {
  t: number
  leaderLaps: number
  /** The lap the leader is on (or the last lap once the race is over). */
  lap: number
  lapsToGo: number
  flag: number
  stage: number | null
  finished: boolean
}

export function raceStateAt(model: RaceModel, t: number): RaceState {
  const leaderLaps = leaderLapsAt(model, t)
  const finished = model.totalLaps > 0 && leaderLaps >= model.totalLaps
  const lap = finished ? model.totalLaps : Math.min(leaderLaps + 1, Math.max(1, model.totalLaps))
  let flag: number = model.lapFlags[lap] ?? FLAG.GREEN
  if (finished) flag = FLAG.CHECKERED
  else if (t <= 0) flag = FLAG.GREEN
  const stageIndex = model.stageEnds.findIndex((end) => lap <= end)
  return {
    t,
    leaderLaps,
    lap,
    lapsToGo: Math.max(0, model.totalLaps - leaderLaps),
    flag,
    stage: model.stageEnds.length ? (stageIndex === -1 ? model.stageEnds.length : stageIndex + 1) : null,
    finished,
  }
}

export interface StandingRow {
  frame: CarFrame
  position: number
  /** Seconds behind the leader at the last line crossing (null before lap 1). */
  gap: number | null
  lapsDown: number
  interval: number | null
  intervalLapsDown: number
  lastLap: number | null
  bestLap: number | null
  lastIsPersonalBest: boolean
  lastIsOverallBest: boolean
  pitCount: number
  positionsGained: number | null
}

/**
 * Timing-and-scoring order: most laps completed, then whoever crossed the line
 * first. Order changes at the line, like the official running order, which
 * keeps it consistent with gaps (also measured at the line). Interpolated
 * progress would not be: a car's long pit-stop lap would drag it backwards
 * mid-lap.
 */
function compareFrames(a: CarFrame, b: CarFrame): number {
  if (a.status === 'grid' || b.status === 'grid')
    return (a.car.startPos ?? 99) - (b.car.startPos ?? 99)
  if (a.laps !== b.laps) return b.laps - a.laps
  // Nobody has reached the line yet: order around the opening lap.
  if (a.laps === 0) return b.progress - a.progress
  return a.car.cross[a.laps] - b.car.cross[b.laps]
}

/** Time behind `ahead` when `car` last crossed the line, in seconds or whole laps. */
function behind(car: CarFrame, ahead: CarFrame): { seconds: number | null; laps: number } {
  const n = car.laps
  if (n < 1 || car === ahead) return { seconds: n < 1 ? null : 0, laps: 0 }
  const crossed = car.car.cross[n]
  const aheadLaps = lapsAt(ahead.car, crossed)
  const laps = Math.max(0, aheadLaps - n)
  if (laps > 0 || ahead.car.lastLap < n) return { seconds: null, laps }
  const seconds = crossed - ahead.car.cross[n]
  // The car ahead crossed this lap *after* us: it passed us since (we stopped,
  // or were lapped in the pits), so we're down by the laps between us now.
  if (seconds < 0) return { seconds: null, laps: Math.max(1, ahead.laps - n) }
  return { seconds, laps: 0 }
}

export function standingsAt(model: RaceModel, t: number): StandingRow[] {
  const frames = model.cars.map((c) => frameAt(c, t, model.finishTime)).sort(compareFrames)
  let overallBest = Infinity
  for (const f of frames) overallBest = Math.min(overallBest, f.car.bestUpTo[f.laps] ?? Infinity)

  const leader = frames[0]
  return frames.map((frame, i) => {
    const { car, laps } = frame
    const g = leader ? behind(frame, leader) : { seconds: null, laps: 0 }
    const iv = i > 0 ? behind(frame, frames[i - 1]) : { seconds: null, laps: 0 }
    const last = laps >= 1 ? car.rawTimes[laps] ?? null : null
    const best = car.bestUpTo[laps]
    const pitCount = car.pits.filter((w) => w.start <= t).length
    return {
      frame,
      position: i + 1,
      gap: i === 0 ? null : g.seconds,
      lapsDown: g.laps,
      interval: iv.seconds,
      intervalLapsDown: iv.laps,
      lastLap: last,
      bestLap: Number.isFinite(best) ? best : null,
      lastIsPersonalBest: last != null && laps >= 2 && last === best,
      lastIsOverallBest: last != null && last === overallBest,
      pitCount,
      positionsGained: car.startPos != null && frame.status !== 'grid' ? car.startPos - (i + 1) : null,
    }
  })
}
