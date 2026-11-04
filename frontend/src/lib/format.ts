/** 29.512 -> "29.512", 101.5 -> "1:41.500". */
export function lapTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return '–'
  if (seconds < 60) return seconds.toFixed(3)
  const m = Math.floor(seconds / 60)
  return `${m}:${(seconds - m * 60).toFixed(3).padStart(6, '0')}`
}

/** Race clock: seconds since green -> "1:02:03" or "12:03". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`
}

export function gap(seconds: number | null, lapsDown: number): string {
  if (lapsDown > 0) return `+${lapsDown} L`
  if (seconds == null) return '–'
  return `+${seconds.toFixed(3)}`
}

export function shortDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function longDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function surname(name: string | null): string {
  if (!name) return ''
  // Drop the feed's markers: "* Connor Zilisch(i)", "Kyle Busch #".
  const clean = name.replace(/^[*#\s]+|\(i\)|[*#]+$/g, '').trim()
  const parts = clean.split(/\s+/)
  const suffix = /^(jr\.?|sr\.?|ii|iii|iv)$/i
  const last = parts.length > 1 && suffix.test(parts.at(-1)!) ? parts.at(-2)! : parts.at(-1)!
  return last ?? clean
}

export function cleanName(name: string | null): string {
  return (name ?? '').replace(/^[*#\s]+|\(i\)|[*#]+$/g, '').trim()
}
