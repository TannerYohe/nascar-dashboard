import type { StatRecord } from '../../api/types'

/** 3 -> "3rd". */
export function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}`
}

/** 3 of 40 -> "7.5%"; nothing out of nothing -> "–". */
export function percent(part: number, whole: number): string {
  if (!whole) return '–'
  const value = (part / whole) * 100
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`
}

/** 2017, 2025 -> "2017–2025"; one season -> "2025". */
export function seasonSpan(first: number, last: number): string {
  return first === last ? String(first) : `${first}–${last}`
}

/** Places gained from start to finish on average: positive means the car moved forward. */
export function positionsGained(record: StatRecord): number | null {
  if (record.avg_start == null || record.avg_finish == null) return null
  return Math.round((record.avg_start - record.avg_finish) * 10) / 10
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'
}

/** The row with the best average finish among those with at least `minStarts` starts. */
export function bestByAvgFinish<T extends { record: StatRecord }>(rows: T[], minStarts: number): T | undefined {
  const eligible = rows.filter((r) => r.record.starts >= minStarts && r.record.avg_finish != null)
  return eligible.sort((a, b) => a.record.avg_finish! - b.record.avg_finish! || b.record.starts - a.record.starts)[0]
}

/** Starts needed for a row to count as someone's "best": three, or fewer when no row has that many. */
export function minStartsFor(rows: { record: StatRecord }[]): number {
  const most = Math.max(0, ...rows.map((r) => r.record.starts))
  return Math.max(1, Math.min(3, most))
}
