import { Crown, Flag, Trophy } from 'lucide-react'

import type { DriverSeason, SeasonStandings } from '../../api/types'
import { cleanName, surname } from '../../lib/format'
import { phaseOf, playoffPhrase, standingsAt } from './model'

function Tile({ icon, label, title, detail }: { icon: React.ReactNode; label: string; title: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-panel p-3 sm:p-4">
      <div className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-faint">
        {icon}
        {label}
      </div>
      <div className="mt-2 truncate font-bold tracking-tight sm:text-lg">{title}</div>
      <div className="mt-0.5 truncate text-xs text-muted">{detail}</div>
    </div>
  )
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

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
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Tile
        icon={<Trophy size={13} className={champion ? 'text-accent' : undefined} />}
        label={champion ? `${s.season} champion` : 'Points leader'}
        title={top ? cleanName(top.name) : '–'}
        detail={
          top
            ? `${top.points[latest]?.toLocaleString()} pts${margin != null && second ? ` · ${margin} ahead of ${surname(second.name)}` : ''}`
            : ''
        }
      />
      <Tile
        icon={<Crown size={13} />}
        label={s.regular_season_champion_id != null ? 'Regular season champion' : 'Regular season leader'}
        title={regular ? cleanName(regular.name) : '–'}
        detail={regular ? `${regular.points[regularAt]?.toLocaleString()} pts · ${plural(regular.wins[regularAt] ?? 0, 'win')}` : ''}
      />
      <Tile
        icon={<Flag size={13} />}
        label="Most wins"
        title={mostWins ? winners.map((d) => cleanName(d.name)).join(', ') : 'No winners yet'}
        detail={plural(mostWins, 'win')}
      />
      <Tile
        icon={<span className="h-2 w-2 rounded-full bg-accent" />}
        label="Season"
        title={s.standings_through === s.races.length ? 'Complete' : `Race ${latest + 1} of ${s.races.length}`}
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
