import { clsx } from 'clsx'
import { Crown, Flag, Trophy } from 'lucide-react'

import type { DriverSeason, SeasonStandings } from '../../api/types'
import { Insight } from '../../components/Insight'
import { cleanName, plural, surname } from '../../lib/format'
import { phaseOf, playoffPhrase, standingsAt } from './model'

/** The season at a glance: who leads or won, the regular-season champion, the most wins and how far along it is. */
export function SummaryTiles({ standings: s }: { standings: SeasonStandings }) {
  const latest = s.standings_through - 1
  const order = standingsAt(s, latest)
  const byId = new Map(s.drivers.map((d) => [d.driver_id, d]))
  const [leader, second] = order
  const firstPlayoff = s.races.findIndex((r) => r.playoff_round)
  const regularEnd = firstPlayoff > 0 ? firstPlayoff - 1 : s.races.length - 1
  const regularDone = latest >= regularEnd

  const champion = s.champion_id != null ? byId.get(s.champion_id) : undefined
  const top = champion ?? leader
  const margin = top && second ? (top.points[latest] ?? 0) - (second.points[latest] ?? 0) : null

  const regular: DriverSeason | undefined =
    s.regular_season_champion_id != null ? byId.get(s.regular_season_champion_id) : regularDone ? undefined : leader
  const regularAt = Math.min(regularEnd, latest)

  const mostWins = Math.max(0, ...order.map((d) => d.wins[latest] ?? 0))
  const winners = order.filter((d) => (d.wins[latest] ?? 0) === mostWins)

  return (
    <div className={clsx('grid grid-cols-2 gap-3', s.format === 'none' ? 'lg:grid-cols-3' : 'lg:grid-cols-4')}>
      <Insight
        compact
        icon={<Trophy size={13} className={champion ? 'text-accent' : undefined} />}
        label={champion ? `${s.season} champion` : 'Points leader'}
        value={top ? cleanName(top.name) : '–'}
        detail={
          top
            ? `${top.points[latest]?.toLocaleString()} pts${margin != null && second ? ` · ${margin} ahead of ${surname(second.name)}` : ''}`
            : ''
        }
      />
      {s.format !== 'none' && (
        <Insight
          compact
          icon={<Crown size={13} />}
          label={s.regular_season_champion_id != null ? 'Regular season champion' : 'Regular season leader'}
          value={regular ? cleanName(regular.name) : '–'}
          detail={regular ? `${regular.points[regularAt]?.toLocaleString()} pts · ${plural(regular.wins[regularAt] ?? 0, 'win')}` : ''}
        />
      )}
      <Insight
        compact
        icon={<Flag size={13} />}
        label="Most wins"
        value={mostWins ? winners.map((d) => cleanName(d.name)).join(', ') : 'No winners yet'}
        detail={plural(mostWins, 'win')}
      />
      <Insight
        compact
        icon={<span className="h-2 w-2 rounded-full bg-accent" />}
        label="Season"
        value={s.standings_through === s.races.length ? 'Complete' : `Race ${latest + 1} of ${s.races.length}`}
        detail={seasonDetail(s, latest, regularEnd)}
      />
    </div>
  )
}

function seasonDetail(s: SeasonStandings, latest: number, regularEnd: number): string {
  if (s.format === 'none') return `${plural(s.races.length, 'race')}, no playoffs`
  const name = playoffPhrase(s)
  const playoffRaces = s.races.length - regularEnd - 1
  if (s.standings_through === s.races.length) return `${regularEnd + 1} regular season + ${playoffRaces} in ${name}`
  const phase = phaseOf(s, latest)
  if (!phase?.playoff) return `${plural(regularEnd - latest, 'race')} until ${name}`
  return s.format === 'chase' ? `In the Chase, ${plural(s.races.length - latest - 1, 'race')} to go` : `Playoffs: ${phase.label}`
}
