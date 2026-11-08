import { clsx } from 'clsx'
import { CircleAlert, CircleCheck, Flag, Gauge, Timer, Trophy, Wrench, X } from 'lucide-react'
import { useMemo } from 'react'

import { cleanName, clock, lapTime } from '../../lib/format'
import { FLAG, flagStyle } from '../../lib/racing'
import { CarChip } from './CarChip'
import type { PitWindow, RaceEvent, RaceModel } from './engine/model'
import type { StandingRow } from './engine/snapshot'
import { type SideTab, useReplayStore } from './store'

interface Props {
  model: RaceModel
  rows: StandingRow[]
  t: number
  visibleCars: Set<number>
}

const TABS: { id: SideTab; label: string }[] = [
  { id: 'feed', label: 'Race feed' },
  { id: 'penalties', label: 'Penalties' },
  { id: 'pits', label: 'Pit stops' },
]

export function SidePanel({ model, rows, t, visibleCars }: Props) {
  const tab = useReplayStore((s) => s.tab)
  const setTab = useReplayStore((s) => s.setTab)
  const selected = useReplayStore((s) => s.selected)
  const selectedRow = selected != null ? rows.find((r) => r.frame.car.driverId === selected) : undefined

  const givenSoFar = model.penalties.filter((p) => p.given <= t).length

  return (
    <div className="flex h-full min-h-0 flex-col">
      {selectedRow && <DriverCard model={model} row={selectedRow} t={t} />}
      <div className="flex gap-1 border-b border-line px-2" role="tablist">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => setTab(x.id)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition',
              tab === x.id ? 'border-accent text-ink' : 'border-transparent text-faint hover:text-muted',
            )}
          >
            {x.label}
            {x.id === 'penalties' && givenSoFar > 0 && (
              <span className="tabular ml-1.5 rounded bg-orange-400/15 px-1 font-mono text-[10px] text-orange-300">
                {givenSoFar}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'feed' && <Feed model={model} t={t} visibleCars={visibleCars} />}
        {tab === 'penalties' && <Penalties model={model} t={t} visibleCars={visibleCars} />}
        {tab === 'pits' && <Pits model={model} t={t} visibleCars={visibleCars} />}
      </div>
    </div>
  )
}

function SeekRow({ time, children, className }: { time: number; children: React.ReactNode; className?: string }) {
  const seek = useReplayStore((s) => s.seek)
  return (
    <li>
      <button
        type="button"
        onClick={() => seek(Math.max(0, time - 2))}
        className={clsx('w-full px-3 py-2 text-left transition hover:bg-raised/70', className)}
        title="Jump here"
      >
        {children}
      </button>
    </li>
  )
}

function EventIcon({ e }: { e: RaceEvent }) {
  const common = 'mt-0.5 shrink-0'
  switch (e.kind) {
    case 'flag':
      return <Flag size={14} className={common} style={{ color: flagStyle(e.flag ?? FLAG.GREEN).color }} />
    case 'stage':
      return <Trophy size={14} className={clsx(common, 'text-accent')} />
    case 'lead':
      return <Gauge size={14} className={clsx(common, 'text-sky-300')} />
    case 'penalty':
      return <CircleAlert size={14} className={clsx(common, 'text-orange-400')} />
    case 'served':
      return <CircleCheck size={14} className={clsx(common, 'text-best-personal')} />
    default:
      return <span className={clsx(common, 'ml-1 mr-0.5 mt-1.5 h-1.5 w-1.5 rounded-full bg-line-strong')} />
  }
}

function Feed({ model, t, visibleCars }: { model: RaceModel; t: number; visibleCars: Set<number> }) {
  const events = useMemo(() => {
    const shown = model.events.filter(
      (e) => e.t <= t && (e.cars.length === 0 || e.kind === 'note' || e.cars.some((c) => visibleCars.has(c))),
    )
    return shown.reverse().slice(0, 200)
  }, [model, t, visibleCars])

  if (!events.length) return <Empty>The race feed fills in as the replay plays.</Empty>
  return (
    <ul className="divide-y divide-line/60">
      {events.map((e) => (
        <SeekRow key={e.id} time={e.t}>
          <div className="flex gap-2.5">
            <EventIcon e={e} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={clsx(
                    'text-[13px] font-semibold',
                    e.kind === 'note' ? 'text-muted' : 'text-ink',
                  )}
                >
                  {e.title}
                </span>
                <span className="tabular shrink-0 font-mono text-[10px] text-faint">
                  {e.lap > 0 ? `L${e.lap}` : 'Pre'}
                </span>
              </div>
              {e.text && <p className="mt-0.5 text-xs leading-relaxed text-muted">{e.text}</p>}
            </div>
          </div>
        </SeekRow>
      ))}
    </ul>
  )
}

function Penalties({ model, t, visibleCars }: { model: RaceModel; t: number; visibleCars: Set<number> }) {
  const list = model.penalties
    .filter((p) => p.given <= t && visibleCars.has(p.penalty.car_number))
    .sort((a, b) => b.given - a.given)
  if (!list.length)
    return <Empty>No penalties yet. Penalties appear here as they're handed out, then marked when served.</Empty>
  return (
    <ul className="divide-y divide-line/60">
      {list.map(({ penalty: p, given, served }) => {
        const car = model.byCar.get(p.car_number)
        const isServed = served != null && served <= t
        const noRecord = served == null
        return (
          <SeekRow key={p.id} time={given}>
            <div className="flex items-start gap-2.5">
              <CarChip label={String(p.car_number)} make={car?.make ?? null} small />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">{p.infraction}</span>
                  <span className="tabular shrink-0 font-mono text-[10px] text-faint">
                    {p.lap > 0 ? `L${p.lap}` : 'Pre'}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                  {car && <span>{cleanName(car.name)}</span>}
                  {p.penalty && <span className="text-ink/80">· {p.penalty}</span>}
                </div>
                <div className="mt-1.5">
                  {isServed ? (
                    <Badge tone="good">
                      Served L{p.served_lap}
                      {p.served_how === 'pit_stop' ? ' · pit road' : p.served_how === 'restart' ? ' · restart' : ''}
                    </Badge>
                  ) : noRecord ? (
                    <Badge tone="muted">Serving not recorded</Badge>
                  ) : (
                    <Badge tone="warn">Pending</Badge>
                  )}
                </div>
                {p.detail && p.detail !== p.infraction && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-faint">{p.detail}</p>
                )}
              </div>
            </div>
          </SeekRow>
        )
      })}
    </ul>
  )
}

function Pits({ model, t, visibleCars }: { model: RaceModel; t: number; visibleCars: Set<number> }) {
  const stops = useMemo(
    () =>
      model.cars
        .filter((c) => c.car != null && visibleCars.has(c.car))
        .flatMap((c) => c.pits.map((w) => ({ car: c, w })))
        .filter(({ w }) => w.start <= t)
        .sort((a, b) => b.w.start - a.w.start),
    [model, t, visibleCars],
  )
  if (!stops.length) return <Empty>No pit stops yet.</Empty>
  return (
    <ul className="divide-y divide-line/60">
      {stops.map(({ car, w }) => {
        const s = w.stop
        const active = t <= w.end
        return (
          <SeekRow key={`${car.driverId}-${w.start}`} time={w.start} className={active ? 'bg-sky-500/5' : undefined}>
            <div className="flex items-start gap-2.5">
              <CarChip label={car.label} make={car.make} small />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">
                    {cleanName(car.name)}
                    {active && <span className="ml-2 text-[10px] font-bold text-sky-300">ON PIT ROAD</span>}
                  </span>
                  <span className="tabular shrink-0 font-mono text-[10px] text-faint">L{s.lap ?? '–'}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Wrench size={11} /> {stopLabel(s.stop_type, s.tires.length)}
                  </span>
                  {s.stop_duration != null && (
                    <span className="tabular inline-flex items-center gap-1 font-mono">
                      <Timer size={11} /> {s.stop_duration.toFixed(1)}s stop
                    </span>
                  )}
                  {s.total_duration != null && (
                    <span className="tabular font-mono text-faint">{s.total_duration.toFixed(1)}s on pit road</span>
                  )}
                </div>
                <PitSplit window={w} t={t} />
                <div className="mt-1.5 flex items-center gap-2">
                  <Tires tires={s.tires} />
                  {s.in_flag != null && (
                    <span className="text-[10px] text-faint">under {flagStyle(s.in_flag).label.toLowerCase()}</span>
                  )}
                  {s.positions_gained != null && s.positions_gained !== 0 && (
                    <span
                      className={clsx(
                        'tabular ml-auto font-mono text-[11px]',
                        s.positions_gained > 0 ? 'text-best-personal' : 'text-flag-red',
                      )}
                    >
                      {s.positions_gained > 0 ? `+${s.positions_gained}` : s.positions_gained} pos
                    </span>
                  )}
                </div>
                {s.infraction && <p className="mt-1 text-[11px] text-orange-300">{s.infraction}</p>}
              </div>
            </div>
          </SeekRow>
        )
      })}
    </ul>
  )
}

/**
 * Pit road as a bar: drive in, stopped, drive out, sized by time, with a
 * marker for where the car is right now while it's on pit road.
 */
function PitSplit({ window: w, t }: { window: PitWindow; t: number }) {
  const total = w.end - w.start
  if (total <= 0 || w.boxIn == null || w.boxOut == null) return null
  const driveIn = w.boxIn - w.start
  const stop = w.boxOut - w.boxIn
  const driveOut = w.end - w.boxOut
  const pct = (x: number) => `${(x / total) * 100}%`
  const now = t >= w.start && t <= w.end ? (t - w.start) / total : null
  return (
    <div className="mt-1.5">
      <div className="relative flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
        <span className="bg-sky-500/40" style={{ width: pct(driveIn) }} />
        <span className="bg-sky-400" style={{ width: pct(stop) }} />
        <span className="bg-sky-500/40" style={{ width: pct(driveOut) }} />
        {now != null && <span className="absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${now * 100}%` }} />}
      </div>
      <div className="tabular mt-0.5 flex justify-between font-mono text-[10px] text-faint">
        <span>in {driveIn.toFixed(1)}s</span>
        <span className="text-sky-300">stopped {stop.toFixed(1)}s</span>
        <span>out {driveOut.toFixed(1)}s</span>
      </div>
    </div>
  )
}

function stopLabel(type: string | null, tires: number): string {
  if (type === 'FOUR_WHEEL_CHANGE') return '4 tires'
  if (type?.startsWith('TWO_WHEEL')) return `2 tires (${type.endsWith('LEFT') ? 'left' : 'right'})`
  if (type === 'ONE_WHEEL_CHANGE') return '1 tire'
  if (tires) return `${tires} tires`
  return 'No tires'
}

function Tires({ tires }: { tires: string[] }) {
  const on = new Set(tires)
  return (
    <span className="grid grid-cols-2 gap-0.5" aria-label={tires.length ? `Changed ${tires.join(', ')}` : 'No tires changed'}>
      {['LF', 'RF', 'LR', 'RR'].map((x) => (
        <span
          key={x}
          title={x}
          className={clsx('h-2 w-3 rounded-[2px]', on.has(x) ? 'bg-ink' : 'bg-line-strong/60')}
        />
      ))}
    </span>
  )
}

function Badge({ tone, children }: { tone: 'good' | 'warn' | 'muted'; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold',
        tone === 'good' && 'bg-best-personal/15 text-best-personal',
        tone === 'warn' && 'bg-orange-400/15 text-orange-300',
        tone === 'muted' && 'bg-raised text-faint',
      )}
    >
      {children}
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs leading-relaxed text-faint">{children}</p>
}

function DriverCard({ model, row, t }: { model: RaceModel; row: StandingRow; t: number }) {
  const { car } = row.frame
  const select = useReplayStore((s) => s.select)
  const stops = car.pits.filter((w) => w.start <= t).length
  const penalties = model.penalties.filter((p) => p.penalty.car_number === car.car && p.given <= t).length
  return (
    <div className="border-b border-line bg-raised/40 px-4 py-3">
      <div className="flex items-start gap-3">
        <CarChip label={car.label} make={car.make} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{cleanName(car.name)}</div>
          <div className="truncate text-xs text-muted">
            {[car.team, car.sponsor?.trim()].filter(Boolean).join(' · ') || car.make}
          </div>
        </div>
        <button
          type="button"
          onClick={() => select(car.driverId)}
          aria-label="Close driver details"
          className="rounded p-1 text-faint hover:bg-raised hover:text-ink"
        >
          <X size={14} />
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
        <Fact label="Running">{row.position}</Fact>
        <Fact label="Started">{car.startPos ?? '–'}</Fact>
        <Fact label="Best lap">{lapTime(row.bestLap)}</Fact>
        <Fact label="Stops">{stops}</Fact>
      </dl>
      <div className="mt-2 flex justify-between text-[11px] text-faint">
        <span>Laps {row.frame.laps}</span>
        {penalties > 0 && <span className="text-orange-300">{penalties} penalt{penalties === 1 ? 'y' : 'ies'}</span>}
        {row.frame.status === 'finished' && car.finishPos != null && <span>Finished P{car.finishPos}</span>}
        {row.frame.status === 'out' && <span className="text-flag-red/80">{car.finishingStatus ?? 'Out'}</span>}
        <span>{clock(car.cross[row.frame.laps] ?? 0)}</span>
      </div>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-panel px-1 py-1.5">
      <dt className="text-[9px] font-semibold uppercase tracking-wider text-faint">{label}</dt>
      <dd className="tabular font-mono text-sm font-semibold">{children}</dd>
    </div>
  )
}
