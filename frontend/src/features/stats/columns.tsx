import { clsx } from 'clsx'
import { Link } from 'react-router'

import type { DriverRecord, SeasonRecord, StatRecord, TeamRecord, TrackRecord } from '../../api/types'
import { cleanName } from '../../lib/format'
import { driverPath, teamPath, trackPath } from './links'
import { ordinal, percent } from './model'
import type { Column } from './StatsTable'

const NAME_LINK = 'font-semibold hover:text-accent'

/** The usual record columns: starts, wins, top 5s and 10s, average finish, laps led and DNF rate. */
export function recordColumns<T>(get: (row: T) => StatRecord): Column<T>[] {
  return [
    { id: 'starts', label: 'Starts', value: (r) => get(r).starts },
    { id: 'wins', label: 'Wins', value: (r) => get(r).wins },
    { id: 'top_5', label: 'Top 5', value: (r) => get(r).top_5, from: 'sm' },
    { id: 'top_10', label: 'Top 10', value: (r) => get(r).top_10 },
    {
      id: 'avg_finish',
      label: 'Avg fin',
      title: 'Average finish',
      value: (r) => get(r).avg_finish,
      render: (r) => get(r).avg_finish?.toFixed(1) ?? '–',
      ascending: true,
    },
    {
      id: 'laps_led',
      label: 'Led',
      title: 'Laps led',
      value: (r) => get(r).laps_led,
      render: (r) => get(r).laps_led.toLocaleString(),
      from: 'md',
    },
    {
      id: 'dnf',
      label: 'DNF',
      title: 'Share of starts not running at the finish',
      value: (r) => (get(r).starts ? get(r).dnfs / get(r).starts : null),
      render: (r) => percent(get(r).dnfs, get(r).starts),
      ascending: true,
      from: 'lg',
    },
  ]
}

/** Season by season, with the final championship standing. `showDriver` names who it belongs to (for teams). */
export function seasonColumns(showDriver: boolean): Column<SeasonRecord>[] {
  return [
    { id: 'season', label: 'Season', text: true, value: (s) => s.season, render: (s) => <span className="font-semibold">{s.season}</span> },
    {
      id: 'teams',
      label: showDriver ? 'As' : 'Team',
      text: true,
      value: (s) => s.teams.join(', '),
      render: (s) => <span className="text-muted">{s.teams.join(', ') || '–'}</span>,
      from: 'md',
    },
    ...recordColumns<SeasonRecord>((s) => s.record),
    {
      id: 'championship',
      label: 'Pts pos',
      title: showDriver ? "Final championship position of the team's best driver" : 'Final championship position',
      value: (s) => s.championship?.position ?? null,
      ascending: true,
      render: (s) =>
        s.championship ? (
          <span className={clsx(s.championship.position === 1 && 'font-bold text-accent')}>
            {ordinal(s.championship.position)}
            {showDriver && <span className="ml-1 text-muted">{cleanName(s.championship.driver_name)}</span>}
          </span>
        ) : (
          <span className="text-faint">–</span>
        ),
    },
  ]
}

export function driverColumns(series: number): Column<DriverRecord>[] {
  return [
    {
      id: 'name',
      label: 'Driver',
      text: true,
      value: (d) => cleanName(d.name),
      render: (d) => (
        <Link to={driverPath(d.driver_id, series)} className={NAME_LINK}>
          {cleanName(d.name)}
        </Link>
      ),
    },
    ...recordColumns<DriverRecord>((d) => d.record),
  ]
}

export function teamColumns(series: number): Column<TeamRecord>[] {
  return [
    {
      id: 'name',
      label: 'Team',
      text: true,
      value: (t) => t.name,
      render: (t) => (
        <Link to={teamPath(t.slug, series)} className={NAME_LINK}>
          {t.name}
        </Link>
      ),
    },
    ...recordColumns<TeamRecord>((t) => t.record),
  ]
}

export function trackColumns(series: number): Column<TrackRecord>[] {
  return [
    {
      id: 'name',
      label: 'Track',
      text: true,
      value: (t) => t.name,
      render: (t) => (
        <Link to={trackPath(t.track_id, series)} className={NAME_LINK}>
          {t.name ?? `Track ${t.track_id}`}
        </Link>
      ),
    },
    ...recordColumns<TrackRecord>((t) => t.record),
  ]
}
