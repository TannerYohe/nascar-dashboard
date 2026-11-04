// Where to draw each car, moment to moment.
//
// Timing and scoring (snapshot.ts) only needs line crossings. Drawing needs
// more: a lap with a pit stop in it is slow because of the stop, not because
// the car crawled all the way round. So a car's path is a list of anchors in
// (time, progress), with progress in laps from the start/finish line:
//
//   - every line crossing: (cross[n], n)
//   - every pit stop: reaching pit entry at the pit-in time, and pit exit at
//     the pit-out time, with the car on pit road in between
//
// Between anchors the car moves at a steady speed, except into and out of pit
// road: the in-lap runs at the car's normal pace and then brakes down to pit
// speed at the entry, and the out-lap accelerates from pit speed back up.

import { type CarModel, lastAtOrBefore, type PitProgress, pitMovingTime, pitProgress, type PitWindow, type RaceModel } from './model'

/** Pit road in lap fractions measured from the start/finish line, race direction. */
export interface PitLayout {
  /** Where pit road leaves the track. */
  entry: number
  /** Where it rejoins. */
  exit: number
}

type AnchorKind = 'line' | 'pitIn' | 'pitOut' | 'start'

interface Anchor {
  t: number
  p: number
  kind: AnchorKind
}

interface Segment {
  t0: number
  t1: number
  p0: number
  p1: number
  /** Brake into pit road at the end ('in'), or accelerate out of it ('out'). */
  ease: 'in' | 'out' | null
  /** Cruising speed and pit-road speed, laps per second. */
  cruise: number
  pit: number
}

export interface CarMotion {
  car: CarModel
  segments: Segment[]
  pits: PitWindow[]
}

export type Placement =
  | { on: 'track'; progress: number }
  | { on: 'pit'; window: PitWindow; progress: PitProgress }

/** Lap fraction from pit entry forward to pit exit. */
export function pitSpan(layout: PitLayout): number {
  const span = (((layout.exit - layout.entry) % 1) + 1) % 1
  return span > 0.005 ? span : 0.1
}

export function buildMotion(model: RaceModel, layout: PitLayout): Map<number, CarMotion> {
  const out = new Map<number, CarMotion>()
  for (const car of model.cars) out.set(car.driverId, carMotion(model, car, layout))
  return out
}

function carMotion(model: RaceModel, car: CarModel, layout: PitLayout): CarMotion {
  const span = pitSpan(layout)
  const pits: PitWindow[] = []
  const pitAnchors: Anchor[] = []
  for (const w of car.pits) {
    // Laps done when the car turned onto pit road, and so where that is.
    const done = Math.max(0, lastAtOrBefore(car.cross, w.start))
    const pIn = done + layout.entry
    pits.push(w)
    pitAnchors.push({ t: w.start, p: pIn, kind: 'pitIn' }, { t: w.end, p: pIn + span, kind: 'pitOut' })
  }

  const anchors: Anchor[] = [{ t: 0, p: -car.gridOffset, kind: 'start' }]
  for (let n = 1; n <= car.lastLap; n++) {
    const t = car.cross[n]
    // A crossing made on pit road is drawn by the pit lane, not the track.
    if (pits.some((w) => w.start < t && t < w.end)) continue
    anchors.push({ t, p: n, kind: 'line' })
  }
  anchors.push(...pitAnchors)
  anchors.sort((a, b) => a.t - b.t || order(a.kind) - order(b.kind))

  // Keep the path moving forward in time and distance. Where a crossing and
  // a pit stop disagree (the track map's pit road and the timing don't quite
  // line up), the pit stop wins and the crossing is dropped.
  const kept: Anchor[] = []
  for (const a of anchors) {
    const last = kept.at(-1)
    if (!last || (a.t > last.t && a.p > last.p)) {
      kept.push(a)
      continue
    }
    if (a.kind !== 'line' && last.kind === 'line') {
      kept.pop()
      while (kept.length && !(a.t > kept.at(-1)!.t && a.p > kept.at(-1)!.p)) kept.pop()
      kept.push(a)
    }
  }

  const segments: Segment[] = []
  for (let i = 0; i + 1 < kept.length; i++) {
    const a = kept[i]
    const b = kept[i + 1]
    // The pit stop itself is drawn on pit road.
    if (a.kind === 'pitIn' && b.kind === 'pitOut') continue
    let ease: Segment['ease'] = null
    if (b.kind === 'pitIn' && a.kind !== 'pitOut') ease = 'in'
    else if (a.kind === 'pitOut' && b.kind !== 'pitIn') ease = 'out'
    const window = ease === 'in' ? pits.find((w) => w.start === b.t) : ease === 'out' ? pits.find((w) => w.end === a.t) : undefined
    segments.push({
      t0: a.t,
      t1: b.t,
      p0: a.p,
      p1: b.p,
      ease,
      cruise:
        1 /
        cruiseLapTime(
          model,
          car,
          // In-lap: the laps just before it. Out-lap: the laps just after.
          ease === 'in'
            ? [Math.floor(b.p), Math.floor(b.p) - 1, Math.floor(b.p) - 2]
            : [Math.ceil(b.p) + 1, Math.ceil(b.p) + 2, Math.ceil(b.p) + 3],
        ),
      pit: window ? span / pitMovingTime(window) : 0,
    })
  }
  return { car, segments, pits }
}

function order(kind: AnchorKind): number {
  return kind === 'pitOut' ? 0 : kind === 'line' ? 1 : 2
}

/**
 * Normal pace: the car's time on the first of `laps` that had no pit stop in
 * it, or else the field's median for the first of them.
 */
function cruiseLapTime(model: RaceModel, car: CarModel, laps: number[]): number {
  const pitLap = (lap: number) => {
    const from = car.cross[lap - 1] ?? 0
    const to = car.cross[lap]
    return car.pits.some((w) => (w.start >= from && w.start <= to) || (w.end >= from && w.end <= to))
  }
  for (const lap of laps) {
    if (lap >= 2 && lap <= car.lastLap && !pitLap(lap)) return car.times[lap]
  }
  return model.fieldLapTime[laps[0]] ?? car.times[Math.max(1, Math.min(car.lastLap, laps[0]))] ?? 30
}

/**
 * Distance covered after `tau` seconds of a stretch `dist` long that takes
 * `total` seconds, cruising at `cruise` but changing speed to or from `edge`
 * at one end ('in': braking at the end; 'out': accelerating at the start).
 * Falls back to a steady speed when the numbers don't allow the change.
 */
export function eased(tau: number, total: number, dist: number, cruise: number, edge: number, mode: 'in' | 'out'): number {
  const steady = (dist * tau) / total
  if (total <= 0 || edge <= 0 || edge >= cruise * 0.95 || total <= dist / cruise) return steady
  // Length of the speed-change zone so the whole stretch takes `total`.
  const zone = (total - dist / cruise) / (2 / (cruise + edge) - 1 / cruise)
  if (!(zone > 0) || zone > dist) return steady
  const zoneTime = (2 * zone) / (cruise + edge)
  if (mode === 'in') {
    const cruiseTime = (dist - zone) / cruise
    if (tau <= cruiseTime) return cruise * tau
    const e = tau - cruiseTime
    const a = (edge - cruise) / zoneTime
    return Math.min(dist, dist - zone + cruise * e + (a * e * e) / 2)
  }
  if (tau <= zoneTime) {
    const a = (cruise - edge) / zoneTime
    return edge * tau + (a * tau * tau) / 2
  }
  return Math.min(dist, zone + cruise * (tau - zoneTime))
}

/** Where a car is at time t: a point on the track (in laps), or on pit road. */
export function placementAt(motion: CarMotion, t: number): Placement {
  for (const w of motion.pits) {
    if (w.start <= t && t <= w.end) return { on: 'pit', window: w, progress: pitProgress(w, t) }
  }
  const segs = motion.segments
  if (!segs.length || t <= segs[0].t0) return { on: 'track', progress: segs[0]?.p0 ?? 0 }
  let lo = 0
  let hi = segs.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (segs[mid].t0 <= t) lo = mid
    else hi = mid - 1
  }
  const s = segs[lo]
  if (t >= s.t1) return { on: 'track', progress: s.p1 }
  const tau = t - s.t0
  const total = s.t1 - s.t0
  const dist = s.p1 - s.p0
  const d = s.ease ? eased(tau, total, dist, s.cruise, s.pit, s.ease) : (dist * tau) / total
  return { on: 'track', progress: s.p0 + d }
}
