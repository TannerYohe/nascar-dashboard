import { clsx } from 'clsx'

import { SERIES } from '../../lib/racing'
import { useSeasonParams } from './useSeasonParams'

/** Series tabs and a season dropdown, bound to the URL. */
export function SeasonPicker() {
  const { year, series, years, seasons, update } = useSeasonParams()
  const seriesInYear = new Set(seasons.data?.find((s) => s.year === year)?.series.map((s) => s.series_id))

  return (
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
  )
}
