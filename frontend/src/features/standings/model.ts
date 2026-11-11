// Pure helpers that turn a season's standings into what the page draws.

import type { DriverSeason, SeasonStandings } from '../../api/types'

export type ChartMode = 'position' | 'gap' | 'points'
export type ChartField = 'playoffs' | 'everyone'

/** A run of consecutive races in one part of the season (inclusive race indexes). */
export interface Phase {
  label: string
  short: string
  start: number
  end: number
  playoff: boolean
}

export interface Divider {
  /** The divider sits below this many rows. */
  after: number
  label: string
}

export type StatusTone = 'champion' | 'alive' | 'out'

export interface Status {
  label: string
  tone: StatusTone
}

/** Highlighted drivers get these color slots, in order. */
export const HIGHLIGHT_SLOTS = 5

export function playoffName(s: SeasonStandings): string {
  return s.format === 'chase' ? 'The Chase' : 'Playoffs'
}

/** The playoffs' name mid-sentence: "the Chase" or "the playoffs". */
export function playoffPhrase(s: SeasonStandings): string {
  return s.format === 'chase' ? 'the Chase' : 'the playoffs'
}

/** How many drivers were still in the playoffs after race `i`. */
function fieldAt(s: SeasonStandings, i: number): number {
  return s.drivers.filter((d) => d.in_playoffs[i]).length
}

function roundLabel(s: SeasonStandings, round: number, start: number, isLast: boolean) {
  const size = start < s.standings_through ? fieldAt(s, start) : 0
  if (isLast && size === 4) return { label: 'Championship 4', short: 'Final' }
  if (size > 0) return { label: `Round of ${size}`, short: `R${size}` }
  return { label: `Round ${round}`, short: `R${round}` }
}

export function phases(s: SeasonStandings): Phase[] {
  const runs: { round: number; start: number; end: number }[] = []
  s.races.forEach((race, i) => {
    const round = race.playoff_round ?? 0
    const last = runs.at(-1)
    if (last && last.round === round) last.end = i
    else runs.push({ round, start: i, end: i })
  })
  return runs.map(({ round, start, end }, k) => {
    if (round === 0) return { label: 'Regular season', short: 'Regular', start, end, playoff: false }
    if (s.format === 'chase') return { label: 'The Chase', short: 'Chase', start, end, playoff: true }
    return { ...roundLabel(s, round, start, k === runs.length - 1), start, end, playoff: true }
  })
}

export function phaseOf(s: SeasonStandings, i: number): Phase | undefined {
  return phases(s).find((p) => i >= p.start && i <= p.end)
}

/** The value a driver's line takes after race `i`, or null for a gap in the line. */
export function chartValue(s: SeasonStandings, d: DriverSeason, i: number, mode: ChartMode): number | null {
  if (mode === 'position') return d.positions[i] ?? null
  if (mode === 'points') return d.points[i] ?? null
  // Once the playoffs start, the gap only means something for drivers still in them.
  if (s.races[i]?.playoff_round && !d.in_playoffs[i]) return null
  return d.gap_to_leader[i] ?? null
}

/** Places gained since the race before `i` (negative for places lost). */
export function positionChange(d: DriverSeason, i: number): number | null {
  const now = d.positions[i]
  const before = d.positions[i - 1]
  return i > 0 && now != null && before != null ? before - now : null
}

/** Drivers with a standing after race `i`, in standings order. */
export function standingsAt(s: SeasonStandings, i: number): DriverSeason[] {
  return s.drivers
    .filter((d) => d.positions[i] != null)
    .sort((a, b) => (a.positions[i] ?? 0) - (b.positions[i] ?? 0))
}

/** The line drawn across the table after race `i`: the playoff cutline, the cut to the next round, or the edge of the Chase field. */
export function divider(s: SeasonStandings, i: number): Divider | null {
  if (s.races[i]?.playoff_round) {
    if (s.format === 'chase') return { after: fieldAt(s, i), label: 'Chase field' }
    // In an elimination round, the line that matters is the cut to the next round.
    const all = phases(s)
    const k = all.findIndex((p) => i >= p.start && i <= p.end)
    const next = all[k + 1]
    const advancing = next && next.start < s.standings_through ? fieldAt(s, next.start) : 0
    if (advancing) return { after: advancing, label: `Top ${advancing} advance` }
    return { after: fieldAt(s, i), label: next ? 'Still in the playoffs' : all[k].label }
  }
  // Before 2026, race winners were locked in, so the top of the points wasn't the cutline.
  if (s.format === 'chase' && s.playoff_field) return { after: s.playoff_field, label: 'Chase cutline' }
  return null
}

export function status(s: SeasonStandings, d: DriverSeason, i: number): Status | null {
  const final = i === s.races.length - 1 && i === s.standings_through - 1
  if (final && s.champion_id === d.driver_id) return { label: 'Champion', tone: 'champion' }
  if (!s.races[i]?.playoff_round) return null
  if (d.in_playoffs[i]) return { label: d.playoff_seed ? `Seed ${d.playoff_seed}` : 'In', tone: 'alive' }
  if (d.playoff_seed == null) return null
  const out = d.in_playoffs.findIndex((alive, k) => k > 0 && !alive && d.in_playoffs[k - 1])
  const phase = out >= 0 ? phaseOf(s, out - 1) : undefined
  return { label: phase ? `Out after ${phase.short}` : 'Eliminated', tone: 'out' }
}

/** The drivers the chart draws. */
export function chartDrivers(s: SeasonStandings, field: ChartField): DriverSeason[] {
  if (field === 'everyone') return s.drivers
  const seeded = s.drivers.filter((d) => d.playoff_seed != null)
  if (seeded.length) return seeded
  // Before the playoffs, the field plus the drivers just outside it.
  const latest = s.standings_through - 1
  const reach = (s.playoff_field ?? 16) + 4
  return standingsAt(s, latest).slice(0, reach)
}

/** The top of the latest standings, one per highlight slot but one. */
export function defaultHighlights(s: SeasonStandings): Map<number, number> {
  const top = standingsAt(s, s.standings_through - 1).slice(0, HIGHLIGHT_SLOTS - 1)
  return new Map(top.map((d, slot) => [d.driver_id, slot]))
}

/** Adds or removes a highlighted driver. Others keep their color; a full set ignores additions. */
export function toggleHighlight(current: Map<number, number>, driverId: number): Map<number, number> {
  const next = new Map(current)
  if (next.delete(driverId)) return next
  const used = new Set(next.values())
  const free = Array.from({ length: HIGHLIGHT_SLOTS }, (_, k) => k).find((k) => !used.has(k))
  if (free !== undefined) next.set(driverId, free)
  return next
}

/** Pushes label positions apart so none sit closer than `gap`, staying within [min, max]. */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, k) => ({ y, k })).sort((a, b) => a.y - b.y)
  const out = order.map((o) => o.y)
  for (let k = 0; k < out.length; k++) out[k] = Math.max(out[k], k ? out[k - 1] + gap : min)
  for (let k = out.length - 1; k >= 0; k--) out[k] = Math.min(out[k], k < out.length - 1 ? out[k + 1] - gap : max)
  const result = new Array<number>(ys.length)
  order.forEach((o, k) => (result[o.k] = out[k]))
  return result
}

/** A sentence on how this season's championship is decided. */
export function formatSummary(s: SeasonStandings): string {
  const regular = s.races.filter((r) => !r.playoff_round).length
  const playoff = s.races.length - regular
  const field = s.playoff_field ?? 16
  if (s.format === 'chase') {
    const starts = s.drivers.map((d) => d.playoff_start_points).filter((p): p is number => p != null)
    const range = starts.length
      ? ` from ${Math.max(...starts).toLocaleString()} for the leader down to ${Math.min(...starts).toLocaleString()}`
      : ' by regular-season finish'
    return `The top ${field} in points after ${regular} races make the Chase. Points reset once,${range}. There are no eliminations: the most points after ${playoff} more races wins the title.`
  }
  if (s.format === 'elimination') {
    const sizes = phases(s)
      .filter((p) => p.playoff)
      .map((p) => (p.start < s.standings_through ? fieldAt(s, p.start) : null))
      .filter((n): n is number => !!n)
    const path = sizes.length > 1 ? ` (${sizes.join(' → ')})` : ''
    return `Race winners and the top drivers in points after ${regular} races make the ${field}-driver playoffs. Points reset at every round and the bottom of the field is cut${path}. The best finisher of the final four in the last race wins the title.`
  }
  return 'The most points across the season wins the title.'
}

export function highlightColor(slot: number): string {
  return `var(--color-series-${slot + 1})`
}

export function formatValue(value: number | null, mode: ChartMode): string {
  if (value == null) return '–'
  if (mode === 'position') return `P${value}`
  if (mode === 'gap') return value === 0 ? 'Leader' : `−${Math.abs(value).toLocaleString()}`
  return value.toLocaleString()
}

/** Round axis ticks spanning [min, max]. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1
  const raw = span / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks = []
  for (let t = Math.ceil(min / step) * step; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 100) / 100)
  return ticks
}
