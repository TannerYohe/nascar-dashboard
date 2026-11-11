import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { useSeasons } from '../../api/client'

/** The season and series in the URL (`?year=&series=`), defaulting to the latest season's Cup Series. */
export function useSeasonParams() {
  const [params, setParams] = useSearchParams()
  const seasons = useSeasons()
  const years = useMemo(() => seasons.data?.map((s) => s.year) ?? [], [seasons.data])
  const year: number | undefined = Number(params.get('year')) || years[0]
  const series = Number(params.get('series')) || 1
  const update = (next: { year?: number; series?: number }) =>
    setParams({ year: String(next.year ?? year), series: String(next.series ?? series) })
  return { year, series, years, seasons, update }
}
