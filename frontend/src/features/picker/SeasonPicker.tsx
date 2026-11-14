import { SeriesTabs } from '../../components/SeriesTabs'
import { useSeasonParams } from './useSeasonParams'

/** Series tabs and a season dropdown, bound to the URL. */
export function SeasonPicker() {
  const { year, series, years, seasons, update } = useSeasonParams()
  const seriesInYear = new Set(seasons.data?.find((s) => s.year === year)?.series.map((s) => s.series_id))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SeriesTabs value={series} onChange={(s) => update({ series: s })} available={seriesInYear.size > 0 ? seriesInYear : undefined} />
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
