import { skipToken, useQuery } from '@tanstack/react-query'

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
  replay: (raceId: number) => get<ReplayBundle>(`/races/${raceId}/replay`),
}

const HOUR = 60 * 60 * 1000

export function useSeasons() {
  return useQuery({ queryKey: ['seasons'], queryFn: api.seasons, staleTime: HOUR })
}

interface RacesOptions {
  year?: number
  series?: number
  enabled?: boolean
}

export function useRaces({ year, series, enabled = true }: RacesOptions = {}) {
  return useQuery({
    queryKey: ['races', year ?? 'all', series ?? 'all'],
    queryFn: () => api.races(year, series),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

/** One race's details; does nothing while `raceId` is undefined. */
export function useRace(raceId: number | undefined) {
  return useQuery({
    queryKey: ['race', raceId],
    queryFn: raceId == null ? skipToken : () => api.race(raceId),
    staleTime: HOUR,
  })
}

/** How long a bundle that's still filling in stays fresh before reopening the race fetches it again. */
const INCOMPLETE_REFETCH = 30 * 1000

export function useReplay(raceId: number) {
  return useQuery({
    queryKey: ['replay', raceId],
    queryFn: () => api.replay(raceId),
    staleTime: (query) => (query.state.data?.complete ? Infinity : INCOMPLETE_REFETCH),
  })
}
