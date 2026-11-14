import { ArrowUpRight, CarFront, Gauge, Trophy } from 'lucide-react'
import { Link } from 'react-router'

import type { ChampionshipFinish, FastLap, StatRecord } from '../../api/types'
import { Insight } from '../../components/Insight'
import { cleanName, plural } from '../../lib/format'
import { replayPath } from './links'
import { ordinal, percent, positionsGained, signed } from './model'

/** Titles won, or else the best final standing. */
export function ChampionshipInsight({
  championships,
  best,
  showDriver,
}: {
  championships: ChampionshipFinish[]
  best: ChampionshipFinish | null
  showDriver?: boolean
}) {
  const icon = <Trophy size={13} className={championships.length ? 'text-accent' : undefined} />
  if (championships.length) {
    const titles = [...championships].sort((a, b) => a.season - b.season)
    return (
      <Insight
        icon={icon}
        label="Championships"
        value={championships.length === 1 ? 'Champion' : `${championships.length}× champion`}
        detail={titles.map((c) => (showDriver ? `${c.season} (${cleanName(c.driver_name)})` : c.season)).join(', ')}
      />
    )
  }
  return (
    <Insight
      icon={icon}
      label="Best championship"
      value={best ? ordinal(best.position) : '–'}
      detail={
        best
          ? `in ${best.season}${showDriver ? `, ${cleanName(best.driver_name)}` : ''}`
          : 'No finished season with final standings yet'
      }
    />
  )
}

/** The fastest lap, linked to that moment in the replay. */
export function FastLapInsight({ lap, showDriver, showTrack }: { lap: FastLap | null; showDriver?: boolean; showTrack?: boolean }) {
  return (
    <Insight
      icon={<Gauge size={13} />}
      label="Top lap speed"
      value={lap ? `${lap.speed_mph.toFixed(1)} mph` : '–'}
      detail={
        lap ? (
          <>
            {showDriver && `${cleanName(lap.driver_name)}, `}
            <Link to={replayPath(lap.race_id, lap.lap)} className="hover:text-accent hover:underline">
              lap {lap.lap} of the {lap.season} {lap.race_name}
            </Link>
            {showTrack && lap.track_name && ` at ${lap.track_name}`}
          </>
        ) : (
          'No lap times in the data'
        )
      }
    />
  )
}

/** How often starts end in a crash, with the DNF rate for context. */
export function CrashInsight({ record }: { record: StatRecord }) {
  return (
    <Insight
      icon={<CarFront size={13} />}
      label="Crash rate"
      value={percent(record.crashes, record.starts)}
      detail={`${record.crashes} of ${plural(record.starts, 'start')} ended in a crash. ${plural(record.dnfs, 'DNF')} in all (${percent(record.dnfs, record.starts)}).`}
    />
  )
}

/** Places made up (or lost) between the start and the finish, on average. */
export function StartToFinishInsight({ record }: { record: StatRecord }) {
  const gained = positionsGained(record)
  return (
    <Insight
      icon={<ArrowUpRight size={13} />}
      label="Start to finish"
      value={gained != null ? `${signed(gained)} places a race` : '–'}
      detail={
        record.avg_start != null && record.avg_finish != null
          ? `Starts ${record.avg_start.toFixed(1)} on average, finishes ${record.avg_finish.toFixed(1)}.`
          : undefined
      }
    />
  )
}
