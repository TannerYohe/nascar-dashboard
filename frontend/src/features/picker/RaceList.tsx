import { clsx } from 'clsx'
import { Link } from 'react-router'

import type { RaceSummary } from '../../api/types'
import { cleanName, shortDate } from '../../lib/format'
import { raceBadge } from './badge'

/** One race as a card in the browse grid. */
export function RaceCard({ race }: { race: RaceSummary }) {
  const badge = raceBadge(race)
  const playable = race.has_lap_data
  return (
    <Link
      to={`/replay/${race.race_id}`}
      className={clsx(
        'group flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 transition',
        playable ? 'hover:-translate-y-0.5 hover:border-line-strong hover:bg-raised' : 'opacity-60 hover:opacity-90',
      )}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
        <span>
          {race.is_exhibition ? 'Exhibition' : race.round != null ? `Round ${race.round}` : ''}
          {race.playoff_round ? <span className="ml-2 text-accent">Playoffs</span> : null}
        </span>
        <span>{shortDate(race.race_date)}</span>
      </div>
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold leading-snug group-hover:text-ink">{race.race_name}</div>
        <div className="truncate text-xs text-muted">{race.track_name}</div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 text-xs">
        {race.winner?.name ? (
          <span className="truncate text-muted">
            <span className="text-faint">Winner </span>
            {race.winner.car_number != null && <span className="font-mono text-ink">#{race.winner.car_number} </span>}
            {cleanName(race.winner.name)}
          </span>
        ) : (
          <span className="text-faint">{race.scheduled_laps ? `${race.scheduled_laps} laps` : ''}</span>
        )}
        {badge && <span className={clsx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.tone)}>{badge.label}</span>}
      </div>
    </Link>
  )
}

/** Compact list used inside the breadcrumb popover. */
export function RaceRows({ races, currentId, onPick }: { races: RaceSummary[]; currentId?: number; onPick?: () => void }) {
  return (
    <ul className="py-1">
      {races.map((r) => {
        const badge = raceBadge(r)
        return (
          <li key={r.race_id}>
            <Link
              to={`/replay/${r.race_id}`}
              onClick={onPick}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 text-sm transition hover:bg-raised',
                r.race_id === currentId && 'bg-raised',
              )}
            >
              <span className="tabular w-7 shrink-0 text-right font-mono text-[11px] text-faint">
                {r.is_exhibition ? 'EX' : r.round}
              </span>
              <span className="min-w-0 flex-1">
                <span className={clsx('block truncate font-medium', !r.has_lap_data && 'text-muted')}>{r.race_name}</span>
                <span className="block truncate text-[11px] text-faint">{r.track_name}</span>
              </span>
              {badge ? (
                <span className={clsx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold', badge.tone)}>{badge.label}</span>
              ) : (
                <span className="shrink-0 text-[11px] text-faint">{shortDate(r.race_date)}</span>
              )}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
