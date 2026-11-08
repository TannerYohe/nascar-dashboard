// Series, flags and manufacturers: names and colors used across the app.

export const SERIES = [
  { id: 1, name: 'Cup Series', short: 'Cup' },
  { id: 2, name: 'Xfinity Series', short: 'Xfinity' },
  { id: 3, name: 'Truck Series', short: 'Truck' },
] as const

export function seriesName(id: number, short = false): string {
  const s = SERIES.find((x) => x.id === id)
  return s ? (short ? s.short : s.name) : `Series ${id}`
}

// nascar_api.enums.Flag
export const FLAG = {
  GREEN: 1,
  YELLOW: 2,
  RED: 3,
  WHITE: 4,
  CHECKERED: 5,
  HOT: 8,
  COLD: 9,
} as const

export interface FlagStyle {
  label: string
  color: string
  ink: string
}

export function flagStyle(state: number): FlagStyle {
  switch (state) {
    case FLAG.YELLOW:
      return { label: 'Caution', color: 'var(--color-flag-yellow)', ink: '#111' }
    case FLAG.RED:
      return { label: 'Red flag', color: 'var(--color-flag-red)', ink: '#fff' }
    case FLAG.WHITE:
      return { label: 'White flag', color: 'var(--color-flag-white)', ink: '#111' }
    case FLAG.CHECKERED:
      return { label: 'Checkered', color: 'var(--color-flag-white)', ink: '#111' }
    case FLAG.HOT:
    case FLAG.COLD:
      return { label: 'Pre-race', color: 'var(--color-faint)', ink: '#fff' }
    default:
      return { label: 'Green', color: 'var(--color-flag-green)', ink: '#04130a' }
  }
}

export const MAKES = ['Chevrolet', 'Ford', 'Toyota'] as const

export interface MakeStyle {
  /** Car color. */
  fill: string
  /** Text color on top of it. */
  ink: string
}

const MAKE_STYLE: Record<string, MakeStyle> = {
  Chevrolet: { fill: '#f2b705', ink: '#1a1300' },
  Ford: { fill: '#3b82f6', ink: '#ffffff' },
  Toyota: { fill: '#ef233c', ink: '#ffffff' },
}
const OTHER_MAKE: MakeStyle = { fill: '#a1a1aa', ink: '#111111' }

export function makeStyle(make: string | null): MakeStyle {
  return (make != null && MAKE_STYLE[make]) || OTHER_MAKE
}
