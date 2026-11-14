import { Link } from 'react-router'

import { useTeams } from '../../api/client'
import type { TeamSummary } from '../../api/types'
import { recordColumns } from '../stats/columns'
import { ExplorerPage } from '../stats/ExplorerPage'
import { teamPath } from '../stats/links'
import { seasonSpan } from '../stats/model'
import type { Column } from '../stats/StatsTable'
import { useSeriesParam } from '../stats/useSeriesParam'

/** Every team that has raced in a series, with its record across all its cars. */
export function TeamsPage() {
  const [param, setSeries] = useSeriesParam()
  const series = param ?? 1
  const teams = useTeams(series)

  const columns: Column<TeamSummary>[] = [
    {
      id: 'name',
      label: 'Team',
      text: true,
      value: (t) => t.name,
      render: (t) => (
        <Link to={teamPath(t.slug, series)} className="font-semibold hover:text-accent">
          {t.name}
        </Link>
      ),
    },
    { id: 'drivers', label: 'Drivers', value: (t) => t.drivers, from: 'md' },
    { id: 'seasons', label: 'Seasons', value: (t) => t.last_season, render: (t) => <span className="text-muted">{seasonSpan(t.first_season, t.last_season)}</span>, from: 'sm' },
    ...recordColumns<TeamSummary>((t) => t.record),
  ]

  return (
    <ExplorerPage
      title="Teams"
      description="Every team's record across all of its cars. Pick one for its drivers, seasons and more."
      noun="teams"
      series={series}
      onSeries={setSeries}
      since={teams.data?.data_since}
      rows={teams.data?.teams}
      error={teams.error}
      columns={columns}
      rowKey={(t) => t.slug}
      sortBy="wins"
      searchText={(t) => t.name}
    />
  )
}
