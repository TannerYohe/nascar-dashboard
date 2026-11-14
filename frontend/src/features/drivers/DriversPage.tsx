import { Link } from 'react-router'

import { useDrivers } from '../../api/client'
import type { DriverSummary } from '../../api/types'
import { cleanName } from '../../lib/format'
import { recordColumns } from '../stats/columns'
import { ExplorerPage } from '../stats/ExplorerPage'
import { driverPath } from '../stats/links'
import { seasonSpan } from '../stats/model'
import type { Column } from '../stats/StatsTable'
import { useSeriesParam } from '../stats/useSeriesParam'

/** Every driver who has raced in a series, with their records. */
export function DriversPage() {
  const [param, setSeries] = useSeriesParam()
  const series = param ?? 1
  const drivers = useDrivers(series)

  const columns: Column<DriverSummary>[] = [
    {
      id: 'name',
      label: 'Driver',
      text: true,
      value: (d) => cleanName(d.name),
      render: (d) => (
        <Link to={driverPath(d.driver_id, series)} className="font-semibold hover:text-accent">
          {cleanName(d.name)}
        </Link>
      ),
    },
    { id: 'team', label: 'Latest team', text: true, value: (d) => d.team, from: 'md', render: (d) => <span className="text-muted">{d.team ?? '–'}</span> },
    { id: 'seasons', label: 'Seasons', value: (d) => d.last_season, render: (d) => <span className="text-muted">{seasonSpan(d.first_season, d.last_season)}</span>, from: 'sm' },
    ...recordColumns<DriverSummary>((d) => d.record),
  ]

  return (
    <ExplorerPage
      title="Drivers"
      description="Every driver's record. Pick one for their seasons, best tracks, top speed and more."
      noun="drivers"
      series={series}
      onSeries={setSeries}
      since={drivers.data?.data_since}
      rows={drivers.data?.drivers}
      error={drivers.error}
      stale={drivers.isPlaceholderData}
      columns={columns}
      rowKey={(d) => d.driver_id}
      sortBy="wins"
      searchText={(d) => `${cleanName(d.name)} ${d.team ?? ''}`}
    />
  )
}
