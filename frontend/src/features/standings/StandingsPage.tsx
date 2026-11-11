import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'

import { useStandings } from '../../api/client'
import type { SeasonStandings } from '../../api/types'
import { Problem } from '../../components/Problem'
import { useDocumentTitle } from '../../lib/brand'
import { cleanName, shortDate } from '../../lib/format'
import { seriesName } from '../../lib/racing'
import { SeasonPicker } from '../picker/SeasonPicker'
import { useSeasonParams } from '../picker/useSeasonParams'
import {
  type ChartField,
  type ChartMode,
  chartDrivers,
  defaultHighlights,
  formatSummary,
  HIGHLIGHT_SLOTS,
  phaseOf,
  playoffName,
  playoffPhrase,
  toggleHighlight,
} from './model'
import { PlayoffSlope } from './PlayoffSlope'
import { PointsChart } from './PointsChart'
import { StandingsTable } from './StandingsTable'
import { SummaryTiles } from './SummaryTiles'

const MODES: { id: ChartMode; label: string }[] = [
  { id: 'position', label: 'Position' },
  { id: 'gap', label: 'Gap to leader' },
  { id: 'points', label: 'Points' },
]

/** Championship standings across a season: the points race, the table after any race, and the playoffs. */
export function StandingsPage() {
  const { year, series, seasons } = useSeasonParams()
  const standings = useStandings(year, series)

  useDocumentTitle('Standings')

  const error = seasons.error ?? standings.error
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Championship standings</h1>
          <p className="mt-1 text-sm text-muted">
            {year} {seriesName(series)}: how the title fight unfolded, race by race.
          </p>
        </div>
        <SeasonPicker />
      </div>

      {error ? (
        <Problem title="Couldn't load the standings" detail={String(error)} />
      ) : !standings.data ? (
        <div className="mt-6 space-y-4">
          <div className="h-24 animate-pulse rounded-xl bg-panel" />
          <div className="h-[28rem] animate-pulse rounded-xl bg-panel" />
        </div>
      ) : standings.data.standings_through === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">No standings yet for this season. They appear after the first points race.</p>
      ) : (
        <div className={clsx('transition-opacity', standings.isPlaceholderData && 'opacity-50')}>
          <SeasonView key={`${standings.data.season}-${standings.data.series_id}`} standings={standings.data} />
        </div>
      )}
    </div>
  )
}

function SeasonView({ standings: s }: { standings: SeasonStandings }) {
  const latest = s.standings_through - 1
  const [race, setRace] = useState(latest)
  const [mode, setMode] = useState<ChartMode>('position')
  const [field, setField] = useState<ChartField>('playoffs')
  const [highlights, setHighlights] = useState(() => defaultHighlights(s))
  const [hoverId, setHoverId] = useState<number | null>(null)

  const drivers = useMemo(() => chartDrivers(s, field), [s, field])
  const toggle = (driverId: number) => setHighlights((h) => toggleHighlight(h, driverId))
  const shared = { standings: s, highlights, hoverId, onHover: setHoverId, onToggle: toggle }

  const current = s.races[race]
  const seeded = s.drivers.some((d) => d.playoff_seed != null)
  const playoffsStarted = seeded && s.races.slice(0, race + 1).some((r) => r.playoff_round)

  return (
    <div className="mt-6 space-y-4">
      <SummaryTiles standings={s} />

      <section className="rounded-xl border border-line bg-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="font-semibold">The points race</h2>
            <p className="text-xs text-muted">{modeHint(mode, s)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={mode} onChange={setMode} options={MODES} label="Chart" />
            <Segmented
              value={field}
              onChange={setField}
              options={[
                { id: 'playoffs', label: seeded ? (s.format === 'chase' ? 'Chase field' : 'Playoff field') : 'Contenders' },
                { id: 'everyone', label: 'Everyone' },
              ]}
              label="Drivers"
            />
          </div>
        </div>
        <div className="px-2 pt-2">
          <PointsChart {...shared} drivers={drivers} mode={mode} selected={race} onSelect={setRace} />
        </div>
        <p className="px-4 pb-3 text-[11px] text-faint">
          Click the chart to see the standings after that race. Click a line or a driver in the table to highlight them (up to {HIGHLIGHT_SLOTS}).
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-xl border border-line bg-panel">
          <RaceStepper standings={s} race={race} onChange={setRace} />
          <StandingsTable {...shared} race={race} />
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-line bg-panel p-4">
            <h2 className="font-semibold">How the title is decided</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{formatSummary(s)}</p>
          </section>
          {playoffsStarted && (
            <section className="rounded-xl border border-line bg-panel p-4">
              <h2 className="font-semibold">{playoffName(s)}: seed to now</h2>
              <p className="mt-1 mb-3 text-xs text-muted">
                Each driver's seed and points after the reset, against where they stand after race {current?.round}.
              </p>
              <PlayoffSlope {...shared} race={race} />
            </section>
          )}
        </aside>
      </div>
    </div>
  )
}

function modeHint(mode: ChartMode, s: SeasonStandings): string {
  if (mode === 'position') return 'Place in the championship after each race.'
  if (mode === 'gap') {
    return s.format === 'none'
      ? 'Points behind the leader after each race.'
      : `Points behind the leader. In ${playoffPhrase(s)}, only drivers still in contention.`
  }
  return s.format === 'none' ? 'Total points after each race.' : 'Total points. The jumps are the playoff resets.'
}

function RaceStepper({ standings: s, race, onChange }: { standings: SeasonStandings; race: number; onChange: (race: number) => void }) {
  const r = s.races[race]
  const last = s.standings_through - 1
  const phase = phaseOf(s, race)
  const button = 'grid h-8 w-8 place-items-center rounded-md border border-line text-muted transition hover:border-line-strong hover:text-ink disabled:opacity-30'
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <div className="flex gap-1">
        <button type="button" className={button} onClick={() => onChange(race - 1)} disabled={race <= 0} aria-label="Previous race">
          <ChevronLeft size={16} />
        </button>
        <button type="button" className={button} onClick={() => onChange(race + 1)} disabled={race >= last} aria-label="Next race">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">
          Standings after race {r.round}: {r.race_name}
        </div>
        <div className="truncate text-xs text-muted">
          {[phase?.label, r.track_name, shortDate(r.race_date), r.winner?.name && `won by ${cleanName(r.winner.name)}`].filter(Boolean).join(' · ')}
          {r.has_lap_data && (
            <>
              {' · '}
              <Link to={`/replay/${r.race_id}`} className="font-semibold text-accent hover:underline">
                Replay
              </Link>
            </>
          )}
        </div>
      </div>
      <div className="relative flex h-4 w-full items-center sm:w-56">
        <div className="absolute inset-x-0 h-1 rounded-full bg-line" />
        <div className="absolute left-0 h-1 rounded-full bg-accent/60" style={{ width: `${last ? (race / last) * 100 : 100}%` }} />
        <input
          type="range"
          min={0}
          max={last}
          value={race}
          onChange={(e) => onChange(Number(e.target.value))}
          className="scrubber relative"
          aria-label="Race"
        />
      </div>
    </div>
  )
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (value: T) => void; options: { id: T; label: string }[]; label: string }) {
  return (
    <div className="flex rounded-lg border border-line bg-bg p-0.5" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === value}
          onClick={() => onChange(o.id)}
          className={clsx(
            'rounded-md px-2.5 py-1 text-xs font-semibold transition',
            o.id === value ? 'bg-raised text-ink shadow' : 'text-faint hover:text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
