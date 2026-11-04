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

export function makeColor(make: string | null): string {
  switch (make) {
    case 'Chevrolet':
      return 'var(--color-chevrolet)'
    case 'Ford':
      return 'var(--color-ford)'
    case 'Toyota':
      return 'var(--color-toyota)'
    default:
      return 'var(--color-other-make)'
  }
}

/** Raw hex for canvas/SVG attributes where CSS variables are awkward. */
export function makeHex(make: string | null): { fill: string; ink: string } {
  switch (make) {
    case 'Chevrolet':
      return { fill: '#f2b705', ink: '#1a1300' }
    case 'Ford':
      return { fill: '#3b82f6', ink: '#ffffff' }
    case 'Toyota':
      return { fill: '#ef233c', ink: '#ffffff' }
    default:
      return { fill: '#a1a1aa', ink: '#111111' }
  }
}
