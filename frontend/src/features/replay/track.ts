// Track geometry: a layout's centerline path, sampled so a lap fraction can be
// turned into a point on screen quickly every frame.
//
// Layouts live in public/tracks/{track_id}.json (see scripts/tracks). Their
// path starts on the start/finish line and runs in the race direction. A track
// with no layout file gets a generic oval.

export interface TrackLayout {
  track_id?: number
  name?: string
  /** [minX, minY, width, height] */
  viewBox: [number, number, number, number]
  /** Racing line, starting at the start/finish line, in race direction. */
  path: string
  /** Pit lane from entry to exit, when the layout has one. */
  pit?: string
  /** Fraction of the lap where pit road starts before, and ends after, the line. */
  pit_window?: [number, number]
  /** True for the generic oval used when there is no real layout. */
  generated?: boolean
  source?: string
}

export interface Point {
  x: number
  y: number
}

export interface Sampled {
  points: Float32Array
  /** Unit normal pointing to the inside of the track. */
  normals: Float32Array
  count: number
  length: number
}

export interface TrackGeometry {
  layout: TrackLayout
  main: Sampled
  pit: Sampled | null
  /** Scale reference: the smaller viewBox side. */
  size: number
}

const SAMPLES = 1600

export const GENERIC_OVAL: TrackLayout = {
  viewBox: [0, 0, 1000, 560],
  // Start/finish mid-way down the front stretch, running counterclockwise.
  path: 'M500 470 L740 470 A190 190 0 0 0 740 90 L260 90 A190 190 0 0 0 260 470 Z',
  pit_window: [0.09, 0.09],
  generated: true,
}

function sample(d: string, count: number, closed: boolean): Sampled {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  el.setAttribute('d', d)
  const length = el.getTotalLength()
  const points = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const p = el.getPointAtLength((i / (closed ? count : count - 1)) * length)
    points[i * 2] = p.x
    points[i * 2 + 1] = p.y
  }
  return sampledFromPoints(points, length, closed)
}

/** A path from points evenly spaced along it, with normals pointing to the inside. */
export function sampledFromPoints(points: Float32Array, length: number, closed: boolean): Sampled {
  const count = points.length / 2
  // Signed area tells which side is inside: with y pointing down, a negative
  // area means the loop runs counterclockwise on screen and the inside is to
  // the left of travel.
  let area = 0
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count
    area += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1]
  }
  const side = area < 0 ? 1 : -1
  const normals = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const a = closed ? (i - 1 + count) % count : Math.max(0, i - 1)
    const b = closed ? (i + 1) % count : Math.min(count - 1, i + 1)
    const dx = points[b * 2] - points[a * 2]
    const dy = points[b * 2 + 1] - points[a * 2 + 1]
    const len = Math.hypot(dx, dy) || 1
    normals[i * 2] = (side * dy) / len
    normals[i * 2 + 1] = (-side * dx) / len
  }
  return { points, normals, count, length }
}

export function buildGeometry(layout: TrackLayout): TrackGeometry {
  return {
    layout,
    main: sample(layout.path, SAMPLES, true),
    pit: layout.pit ? sample(layout.pit, 400, false) : null,
    size: Math.min(layout.viewBox[2], layout.viewBox[3]),
  }
}

/** Point at fraction u of a sampled path, pushed `lateral` units toward the inside. */
export function pointOn(s: Sampled, u: number, lateral = 0, closed = true): Point {
  const f = closed ? (((u % 1) + 1) % 1) * s.count : Math.max(0, Math.min(1, u)) * (s.count - 1)
  const i = Math.floor(f)
  const j = closed ? (i + 1) % s.count : Math.min(s.count - 1, i + 1)
  const k = f - i
  const x = s.points[i * 2] + (s.points[j * 2] - s.points[i * 2]) * k
  const y = s.points[i * 2 + 1] + (s.points[j * 2 + 1] - s.points[i * 2 + 1]) * k
  return { x: x + s.normals[i * 2] * lateral, y: y + s.normals[i * 2 + 1] * lateral }
}

/** Where a car is during a pit stop, `f` 0..1 from pit entry to exit. */
export function pitPoint(g: TrackGeometry, f: number): Point {
  if (g.pit) return pointOn(g.pit, f, 0, false)
  const [before, after] = g.layout.pit_window ?? [0.06, 0.06]
  // No pit lane geometry: run a lane just inside the front stretch.
  return pointOn(g.main, 1 - before + f * (before + after), g.size * 0.045)
}

/** The loop position (0..1 along the layout's path) closest to a point. */
function nearestParam(s: Sampled, p: Point): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < s.count; i++) {
    const d = (s.points[i * 2] - p.x) ** 2 + (s.points[i * 2 + 1] - p.y) ** 2
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best / s.count
}

export interface Alignment {
  /** Where the start/finish line is, as a position along the layout's path. */
  line: number
  /** Pit entry and exit, in lap fractions from the line (what the motion model wants). */
  entry: number
  exit: number
}

const wrap = (x: number) => ((x % 1) + 1) % 1

/**
 * Line the map up with the timing. The layout knows where pit road leaves
 * and rejoins the track; the race's pit stops say where along pit road the
 * line is (`pitLine`, 0 entry to 1 exit, beyond either end when the line is
 * off pit road). Without that, the layout's own start/finish is used.
 */
export function alignToTiming(g: TrackGeometry, pitLine: number | null): Alignment {
  let entryAt: number
  let exitAt: number
  if (g.pit) {
    const n = g.pit.count - 1
    entryAt = nearestParam(g.main, { x: g.pit.points[0], y: g.pit.points[1] })
    exitAt = nearestParam(g.main, { x: g.pit.points[n * 2], y: g.pit.points[n * 2 + 1] })
  } else {
    const [before, after] = g.layout.pit_window ?? [0.06, 0.06]
    entryAt = wrap(1 - before)
    exitAt = after
  }
  let span = wrap(exitAt - entryAt)
  if (span < 0.005) span = 0.1
  const line = pitLine == null ? 0 : wrap(entryAt + pitLine * span)
  return { line, entry: wrap(entryAt - line), exit: wrap(exitAt - line) }
}

/** public/tracks/{track_id}.json: one layout per lap length raced there. */
interface TrackFile {
  track_id: number
  name: string
  source: string
  variants: (TrackLayout & { length_mi: number })[]
}

const cache = new Map<number, Promise<TrackFile | null>>()

function loadFile(trackId: number): Promise<TrackFile | null> {
  if (!cache.has(trackId)) {
    cache.set(
      trackId,
      fetch(`/tracks/${trackId}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<TrackFile>) : null))
        // The dev server answers a missing file with index.html, which isn't JSON.
        .catch(() => null),
    )
  }
  return cache.get(trackId)!
}

/** The layout for a race: the variant closest to its lap length, or the generic oval. */
export async function loadLayout(trackId: number | null, lengthMi: number | null): Promise<TrackLayout> {
  if (trackId == null) return GENERIC_OVAL
  const file = await loadFile(trackId)
  if (!file?.variants?.length) return GENERIC_OVAL
  const target = lengthMi ?? file.variants[0].length_mi
  const best = file.variants.reduce((a, b) =>
    Math.abs(b.length_mi - target) < Math.abs(a.length_mi - target) ? b : a,
  )
  return { ...best, track_id: file.track_id, name: file.name, source: file.source }
}
