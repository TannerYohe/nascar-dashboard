import { queryOptions, skipToken, useQuery } from '@tanstack/react-query'

import type {
  DriverList,
  DriverProfile,
  RaceSummary,
  ReplayBundle,
  Season,
  SeasonStandings,
  TeamList,
  TeamProfile,
  TrackList,
  TrackProfile,
} from './types'

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
  replay: (raceId: number) => get<ReplayBundle>(`/races/${raceId}/replay`),
  standings: (year: number, series: number) => get<SeasonStandings>('/standings', { year, series }),
  drivers: (series: number) => get<DriverList>('/drivers', { series }),
  driver: (driverId: number, series?: number) => get<DriverProfile>(`/drivers/${driverId}`, { series }),
  teams: (series: number) => get<TeamList>('/teams', { series }),
  team: (slug: string, series?: number) => get<TeamProfile>(`/teams/${encodeURIComponent(slug)}`, { series }),
  tracks: (series: number) => get<TrackList>('/tracks', { series }),
  track: (trackId: number, series?: number) => get<TrackProfile>(`/tracks/${trackId}`, { series }),
}

const HOUR = 60 * 60 * 1000

export function useSeasons() {
  return useQuery({ queryKey: ['seasons'], queryFn: api.seasons, staleTime: HOUR })
}

interface RacesOptions {
  year?: number
  enabled?: boolean
}

/** Every race in `year`, or in every year when it's undefined. */
export function racesQuery(year?: number) {
  return queryOptions({
    queryKey: ['races', year ?? 'all'],
    queryFn: () => api.races(year),
    staleTime: 5 * 60 * 1000,
  })
}

export function useRaces({ year, enabled = true }: RacesOptions = {}) {
  return useQuery({ ...racesQuery(year), enabled })
}

/** One series' races in `year`, filtered from that season's listing; does nothing while `year` is undefined. */
export function useSeriesRaces(year: number | undefined, series: number) {
  return useQuery({
    ...racesQuery(year),
    select: (races) => races.filter((r) => r.series_id === series),
    enabled: year != null,
  })
}

/** How long a bundle that's still filling in stays fresh before reopening the race fetches it again. */
const INCOMPLETE_REFETCH = 30 * 1000

function replayQuery(raceId: number | undefined) {
  return queryOptions({
    queryKey: ['replay', raceId],
    queryFn: raceId == null ? skipToken : () => api.replay(raceId),
    staleTime: (query) => (query.state.data?.complete ? Infinity : INCOMPLETE_REFETCH),
  })
}

export function useReplay(raceId: number) {
  return useQuery(replayQuery(raceId))
}

/** The details of the race being replayed, read from the replay bundle; does nothing while `raceId` is undefined. */
export function useReplayRace(raceId: number | undefined) {
  return useQuery({ ...replayQuery(raceId), select: (bundle) => bundle.race })
}

/** A season's championship standings; does nothing while `year` is undefined. */
export function useStandings(year: number | undefined, series: number) {
  return useQuery({
    queryKey: ['standings', year, series],
    queryFn: year == null ? skipToken : () => api.standings(year, series),
    staleTime: 5 * 60 * 1000,
    placeholderData: (previous) => previous,
  })
}

const STATS_STALE = 5 * 60 * 1000

/** Everyone who has raced in a series, with their records. */
export function useDrivers(series: number) {
  return useQuery({ queryKey: ['drivers', series], queryFn: () => api.drivers(series), staleTime: STATS_STALE, placeholderData: (previous) => previous })
}

/** A driver's records in `series`, or in the series they've raced most when it's undefined. */
export function useDriver(driverId: number, series: number | undefined) {
  return useQuery({ queryKey: ['driver', driverId, series], queryFn: () => api.driver(driverId, series), staleTime: STATS_STALE })
}

export function useTeams(series: number) {
  return useQuery({ queryKey: ['teams', series], queryFn: () => api.teams(series), staleTime: STATS_STALE, placeholderData: (previous) => previous })
}

export function useTeam(slug: string, series: number | undefined) {
  return useQuery({ queryKey: ['team', slug, series], queryFn: () => api.team(slug, series), staleTime: STATS_STALE })
}

export function useTracks(series: number) {
  return useQuery({ queryKey: ['tracks', series], queryFn: () => api.tracks(series), staleTime: STATS_STALE, placeholderData: (previous) => previous })
}

export function useTrack(trackId: number, series: number | undefined) {
  return useQuery({ queryKey: ['track', trackId, series], queryFn: () => api.track(trackId, series), staleTime: STATS_STALE })
}
