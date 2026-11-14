import { Link } from 'react-router'

import { useTracks } from '../../api/client'
import type { TrackSummary } from '../../api/types'
import { ExplorerPage } from '../stats/ExplorerPage'
import { trackPath } from '../stats/links'
import { seasonSpan } from '../stats/model'
import type { Column } from '../stats/StatsTable'
import { useSeriesParam } from '../stats/useSeriesParam'

/** Every track a series has raced at. */
export function TracksPage() {
  const [param, setSeries] = useSeriesParam()
  const series = param ?? 1
  const tracks = useTracks(series)

  const columns: Column<TrackSummary>[] = [
    {
      id: 'name',
      label: 'Track',
      text: true,
      value: (t) => t.name,
      render: (t) => (
        <Link to={trackPath(t.track_id, series)} className="font-semibold hover:text-accent">
          {t.name ?? `Track ${t.track_id}`}
        </Link>
      ),
    },
    { id: 'length', label: 'Length', title: 'Miles per lap', value: (t) => t.length_mi, render: (t) => (t.length_mi ? `${t.length_mi.toFixed(3)} mi` : '–') },
    { id: 'races', label: 'Races', value: (t) => t.races },
    { id: 'seasons', label: 'Seasons', value: (t) => t.first_season, render: (t) => <span className="text-muted">{seasonSpan(t.first_season, t.last_season)}</span>, from: 'sm' },
    { id: 'last', label: 'Last raced', value: (t) => t.last_season, from: 'sm' },
  ]

  return (
    <ExplorerPage
      title="Tracks"
      description="Every track on the schedule. Pick one for its winners, caution counts, fastest laps and more."
      noun="tracks"
      series={series}
      onSeries={setSeries}
      since={tracks.data?.data_since}
      rows={tracks.data?.tracks}
      error={tracks.error}
      stale={tracks.isPlaceholderData}
      columns={columns}
      rowKey={(t) => t.track_id}
      sortBy="last"
      searchText={(t) => t.name ?? ''}
    />
  )
}
