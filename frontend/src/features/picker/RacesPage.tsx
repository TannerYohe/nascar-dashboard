import { Search } from 'lucide-react'
import { useState } from 'react'

import { useSeriesRaces } from '../../api/client'
import { useDocumentTitle } from '../../lib/brand'
import { RaceCard } from './RaceList'
import { SeasonPicker } from './SeasonPicker'
import { useSeasonParams } from './useSeasonParams'

/** Browse: pick a series and a season, then a race. */
export function RacesPage() {
  const { year, series, seasons } = useSeasonParams()
  const races = useSeriesRaces(year, series)
  const [query, setQuery] = useState('')

  useDocumentTitle('Races')

  const q = query.trim().toLowerCase()
  const list = (races.data ?? []).filter(
    (r) =>
      !q ||
      r.race_name?.toLowerCase().includes(q) ||
      r.track_name?.toLowerCase().includes(q) ||
      r.winner?.name?.toLowerCase().includes(q),
  )

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pick a race</h1>
          <p className="mt-1 text-sm text-muted">Choose a series and season, then open any race to replay it lap by lap.</p>
        </div>
        <SeasonPicker />
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-line bg-panel px-3">
        <Search size={15} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by race, track or winner"
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <span className="text-xs text-faint">{list.length} races</span>
      </div>

      {races.isLoading || seasons.isLoading ? (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-panel" />
          ))}
        </div>
      ) : races.error || seasons.error ? (
        <p className="mt-10 text-center text-sm text-muted">
          Couldn't reach the API. Is the backend running? ({String(races.error ?? seasons.error)})
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((r) => (
            <RaceCard key={r.race_id} race={r} />
          ))}
        </div>
      )}
    </div>
  )
}
