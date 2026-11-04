import { clsx } from 'clsx'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

import { useRaces, useSeasons } from '../../api/client'
import { SERIES } from '../../lib/racing'
import { RaceCard } from './RaceList'

/** Browse: pick a series and a season, then a race. */
export function RacesPage() {
  const [params, setParams] = useSearchParams()
  const seasons = useSeasons()
  const years = useMemo(() => seasons.data?.map((s) => s.year) ?? [], [seasons.data])
  const year = Number(params.get('year')) || years[0]
  const series = Number(params.get('series')) || 1
  const races = useRaces(year, series, year != null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    document.title = 'Races · Race Rewind'
  }, [])

  const update = (next: { year?: number; series?: number }) =>
    setParams({ year: String(next.year ?? year), series: String(next.series ?? series) })

  const seriesInYear = new Set(seasons.data?.find((s) => s.year === year)?.series.map((s) => s.series_id))

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist" aria-label="Series">
            {SERIES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={s.id === series}
                onClick={() => update({ series: s.id })}
                disabled={seriesInYear.size > 0 && !seriesInYear.has(s.id)}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-30',
                  s.id === series ? 'bg-raised text-ink shadow' : 'text-faint hover:text-muted',
                )}
              >
                {s.short}
              </button>
            ))}
          </div>
          <select
            value={year ?? ''}
            onChange={(e) => update({ year: Number(e.target.value) })}
            className="h-9 rounded-lg border border-line bg-panel px-3 text-sm font-semibold outline-none"
            aria-label="Season"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
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
