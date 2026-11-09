import { describe, expect, it } from 'vitest'

import { alignToTiming, sampledFromPoints, type Sampled, type TrackGeometry, type TrackLayout } from './track'

/** Samples an M/L/Z path at evenly spaced points, as `sample` does with the browser's SVG API. */
function samplePolyline(d: string, count: number, closed: boolean): Sampled {
  const numbers = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
  const vertices: [number, number][] = []
  for (let i = 0; i + 1 < numbers.length; i += 2) vertices.push([numbers[i], numbers[i + 1]])
  if (closed) vertices.push(vertices[0])

  const along = [0]
  for (let i = 1; i < vertices.length; i++) {
    const [x0, y0] = vertices[i - 1]
    const [x1, y1] = vertices[i]
    along.push(along[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  const length = along.at(-1)!
  const points = new Float32Array(count * 2)
  let seg = 1
  for (let i = 0; i < count; i++) {
    const at = (i / (closed ? count : count - 1)) * length
    while (seg < vertices.length - 1 && along[seg] < at) seg++
    const k = (at - along[seg - 1]) / (along[seg] - along[seg - 1] || 1)
    points[i * 2] = vertices[seg - 1][0] + (vertices[seg][0] - vertices[seg - 1][0]) * k
    points[i * 2 + 1] = vertices[seg - 1][1] + (vertices[seg][1] - vertices[seg - 1][1]) * k
  }
  return sampledFromPoints(points, length, closed)
}

function geometry(layout: TrackLayout): TrackGeometry {
  return {
    layout,
    main: samplePolyline(layout.path, 1600, true),
    pit: layout.pit ? samplePolyline(layout.pit, 400, false) : null,
    size: Math.min(layout.viewBox[2], layout.viewBox[3]),
  }
}

describe('alignToTiming', () => {
  // A 400-unit square starting mid-way along the bottom. Pit road runs just
  // inside the bottom edge from 0.9 of the lap to 0.1.
  const square = geometry({
    viewBox: [0, 0, 100, 100],
    path: 'M50 100 L100 100 L100 0 L0 0 L0 100 Z',
    pit: 'M10 95 L90 95',
  })

  it("keeps the layout's own line without timing", () => {
    const a = alignToTiming(square, null)
    expect(a.line).toBe(0)
    expect(a.entry).toBeCloseTo(0.9, 2)
    expect(a.exit).toBeCloseTo(0.1, 2)
  })

  it('moves the line along pit road', () => {
    // A quarter of the way down a pit road 0.2 laps long.
    const a = alignToTiming(square, 0.25)
    expect(a.line).toBeCloseTo(0.95, 2)
    expect(a.entry).toBeCloseTo(0.95, 2)
    expect(a.exit).toBeCloseTo(0.15, 2)
  })

  it('puts the line past pit exit', () => {
    const a = alignToTiming(square, 1.5)
    expect(a.line).toBeCloseTo(0.2, 2)
    expect(a.entry).toBeCloseTo(0.7, 2)
    expect(a.exit).toBeCloseTo(0.9, 2)
  })

  it('falls back to the pit window without a pit lane', () => {
    const a = alignToTiming(geometry({ viewBox: [0, 0, 100, 100], path: square.layout.path, pit_window: [0.06, 0.04] }), null)
    expect(a.entry).toBeCloseTo(0.94, 5)
    expect(a.exit).toBeCloseTo(0.04, 5)
  })
})

interface TrackFile {
  name: string
  variants: (TrackLayout & { length_mi: number })[]
}

const trackFiles = import.meta.glob<TrackFile>('../../../public/tracks/*.json', { eager: true, import: 'default' })

describe('shipped track layouts', () => {
  const layouts = Object.values(trackFiles).flatMap((file) =>
    file.variants.filter((v) => v.pit).map((v) => ({ label: `${file.name} ${v.length_mi} mi`, layout: v })),
  )

  it('has layouts to check', () => {
    expect(layouts.length).toBeGreaterThan(0)
  })

  it.each(layouts)('$label: pit lane runs in the race direction', ({ layout }) => {
    // A pit lane drawn backwards spans most of the lap going forward from its "entry".
    const { entry, exit } = alignToTiming(geometry(layout), null)
    const forward = (((exit - entry) % 1) + 1) % 1
    expect(forward).toBeLessThan(0.5)
  })
})
