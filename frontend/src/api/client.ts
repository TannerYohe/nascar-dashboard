import { useQuery } from '@tanstack/react-query'

import type { RaceDetail, RaceSummary, ReplayBundle, Season } from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string, params?: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) query.set(k, String(v))
  const qs = query.toString()
  const res = await fetch(`/api${path}${qs ? `?${qs}` : ''}`)
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const api = {
  seasons: () => get<Season[]>('/seasons'),
  races: (year?: number, series?: number) => get<RaceSummary[]>('/races', { year, series }),
  race: (raceId: number) => get<RaceDetail>(`/races/${raceId}`),
  replay: (raceId: number, sinceLap?: number) =>
    get<ReplayBundle>(`/races/${raceId}/replay`, { since_lap: sinceLap }),
}

const HOUR = 60 * 60 * 1000

export function useSeasons() {
  return useQuery({ queryKey: ['seasons'], queryFn: api.seasons, staleTime: HOUR })
}

export function useRaces(year?: number, series?: number, enabled = true) {
  return useQuery({
    queryKey: ['races', year ?? 'all', series ?? 'all'],
    queryFn: () => api.races(year, series),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

export function useRace(raceId: number) {
  return useQuery({ queryKey: ['race', raceId], queryFn: () => api.race(raceId), staleTime: HOUR })
}

export function useReplay(raceId: number) {
  return useQuery({
    queryKey: ['replay', raceId],
    queryFn: () => api.replay(raceId),
    staleTime: Infinity,
  })
}
