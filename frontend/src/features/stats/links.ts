// Paths to the driver, team and track pages, keeping the series being viewed.

export function driverPath(driverId: number, series: number): string {
  return `/drivers/${driverId}?series=${series}`
}

export function teamPath(slug: string, series: number): string {
  return `/teams/${encodeURIComponent(slug)}?series=${series}`
}

export function trackPath(trackId: number, series: number): string {
  return `/tracks/${trackId}?series=${series}`
}

export function replayPath(raceId: number, lap?: number): string {
  return lap != null ? `/replay/${raceId}?lap=${lap}` : `/replay/${raceId}`
}
