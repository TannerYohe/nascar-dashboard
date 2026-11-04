import type { RaceSummary } from '../../api/types'

export function raceBadge(r: RaceSummary): { label: string; tone: string } | null {
  if (r.status === 'live') return { label: 'Live', tone: 'bg-flag-red/15 text-flag-red' }
  if (r.status === 'scheduled') return { label: 'Upcoming', tone: 'bg-raised text-faint' }
  if (!r.has_lap_data) return { label: 'No lap data', tone: 'bg-raised text-faint' }
  return null
}
