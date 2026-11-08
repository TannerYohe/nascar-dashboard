import { clsx } from 'clsx'
import { Eye, EyeOff, Flag } from 'lucide-react'
import { useState } from 'react'

import { cleanName, gap, lapTime, surname } from '../../lib/format'
import { CarChip } from './CarChip'
import { type PitProgress, penaltyStatusAt, type RaceModel } from './engine/model'
import type { StandingRow } from './engine/snapshot'
import { useReplayStore } from './store'

interface Props {
  model: RaceModel
  rows: StandingRow[]
  t: number
}

/** PIT while driving down pit road; a running stop clock while in the box. */
function PitBadge({ state }: { state: PitProgress | null }) {
  const stopped = state?.phase === 'stopped'
  return (
    <span
      className={clsx(
        'tabular shrink-0 rounded px-1 font-mono text-[10px] font-bold',
        stopped ? 'bg-sky-400 text-sky-950' : 'bg-sky-500/20 text-sky-300',
      )}
    >
      {stopped ? `STOP ${state.stopped.toFixed(1)}` : 'PIT'}
    </span>
  )
}

export function Leaderboard({ model, rows, t }: Props) {
  const [mode, setMode] = useState<'gap' | 'interval'>('gap')
  const hidden = useReplayStore((s) => s.hidden)
  const filterMode = useReplayStore((s) => s.filterMode)
  const selected = useReplayStore((s) => s.selected)
  const hovered = useReplayStore((s) => s.hovered)
  const { select, hover, toggleHidden } = useReplayStore.getState()

  const activePenalty = (car: number | null) =>
    car != null &&
    model.penalties.some((p) => p.penalty.car_number === car && penaltyStatusAt(p, t) === 'pending')

  const visibleRows = filterMode === 'hide' ? rows.filter((r) => !hidden.has(r.frame.car.driverId)) : rows

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-[1.75rem_1.6rem_2.25rem_minmax(0,1fr)_4.25rem_4rem_1rem_1rem] items-center gap-x-1.5 border-b border-line px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
        <span className="text-right">Pos</span>
        <span />
        <span>Car</span>
        <span>Driver</span>
        <button
          type="button"
          onClick={() => setMode(mode === 'gap' ? 'interval' : 'gap')}
          className="rounded text-right uppercase tracking-wider transition hover:text-ink"
          title="Switch between gap to leader and interval to the car ahead"
        >
          {mode === 'gap' ? 'Gap' : 'Int'} ⇄
        </button>
        <span className="text-right">Last</span>
        <span className="text-center" title="Pit stops">P</span>
        <span />
      </div>
      <ol className="flex-1 overflow-y-auto py-1" aria-label="Running order">
        {visibleRows.map((row) => {
          const { car, status } = row.frame
          const isHidden = hidden.has(car.driverId)
          const isSel = selected === car.driverId
          const out = status === 'out'
          const delta = row.positionsGained
          const penalty = activePenalty(car.car)
          return (
            <li
              key={car.driverId}
              onPointerEnter={() => hover(car.driverId)}
              onPointerLeave={() => hover(null)}
              onClick={() => select(car.driverId)}
              className={clsx(
                'group grid cursor-pointer grid-cols-[1.75rem_1.6rem_2.25rem_minmax(0,1fr)_4.25rem_4rem_1rem_1rem] items-center gap-x-1.5 px-3 py-[3px] text-[13px] transition',
                isSel ? 'bg-raised ring-1 ring-inset ring-line-strong' : hovered === car.driverId ? 'bg-hover/60' : '',
                (out || (isHidden && filterMode === 'dim')) && 'opacity-45',
              )}
            >
              <span className="tabular text-right font-mono font-semibold text-muted">{row.position}</span>
              <span
                className={clsx(
                  'tabular text-center font-mono text-[10px]',
                  delta == null || delta === 0 ? 'text-faint' : delta > 0 ? 'text-best-personal' : 'text-flag-red',
                )}
                title={car.startPos ? `Started ${car.startPos}` : undefined}
              >
                {delta == null || delta === 0 ? '·' : delta > 0 ? `▲${delta}` : `▼${-delta}`}
              </span>
              <CarChip label={car.label} make={car.make} />
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate font-medium" title={cleanName(car.name)}>
                  {surname(car.name)}
                </span>
                {status === 'pit' && <PitBadge state={row.frame.pitState} />}
                {penalty && (
                  <Flag size={12} className="shrink-0 text-orange-400" aria-label="Penalty pending" />
                )}
              </span>
              <span className="tabular text-right font-mono text-xs text-muted">
                {out ? (
                  <span className="text-flag-red/80">OUT</span>
                ) : row.position === 1 ? (
                  <span className="text-faint">Leader</span>
                ) : mode === 'gap' ? (
                  gap(row.gap, row.lapsDown)
                ) : (
                  gap(row.interval, row.intervalLapsDown)
                )}
              </span>
              <span
                className={clsx(
                  'tabular text-right font-mono text-xs',
                  row.lastIsOverallBest
                    ? 'text-best-overall'
                    : row.lastIsPersonalBest
                      ? 'text-best-personal'
                      : 'text-muted',
                )}
                title={row.bestLap ? `Best ${lapTime(row.bestLap)}` : undefined}
              >
                {out ? `L${row.frame.laps}` : lapTime(row.lastLap)}
              </span>
              <span className="tabular text-center font-mono text-xs text-faint">{row.pitCount || ''}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleHidden(car.driverId)
                }}
                aria-label={isHidden ? `Show #${car.label}` : `Hide #${car.label}`}
                className={clsx(
                  'grid place-items-center rounded text-faint transition hover:text-ink',
                  isHidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100',
                )}
              >
                {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </li>
          )
        })}
      </ol>
      <div className="flex gap-3 border-t border-line px-3 pt-2 text-[10px] text-faint">
        <span>
          <span className="text-best-overall">■</span> fastest lap
        </span>
        <span>
          <span className="text-best-personal">■</span> personal best
        </span>
        <span className="ml-auto">Gaps derived from lap times</span>
      </div>
    </div>
  )
}
