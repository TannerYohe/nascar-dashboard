import * as Popover from '@radix-ui/react-popover'
import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, Outlet, useMatch, useNavigate, useSearchParams } from 'react-router'

import { useRaces, useReplayRace, useSeasons } from '../api/client'
import { CommandPalette } from '../features/picker/CommandPalette'
import { RaceRows } from '../features/picker/RaceList'
import { SERIES, seriesName } from '../lib/racing'

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-bg/80 px-4 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="hidden sm:inline">Race Rewind</span>
        </Link>
        <span className="h-5 w-px bg-line" aria-hidden />
        <Breadcrumb />
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-faint transition hover:border-line-strong hover:text-muted"
        >
          <Search size={14} />
          <span className="hidden md:inline">Search races</span>
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] md:inline">Ctrl K</kbd>
        </button>
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col lg:overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

/** Year › Series › Race, each one a popover to change that level. */
function Breadcrumb() {
  const home = useMatch('/')
  const replay = useMatch('/replay/:raceId')
  const raceId = replay ? Number(replay.params.raceId) : undefined
  const race = useReplayRace(raceId)
  const [params] = useSearchParams()
  const seasons = useSeasons()

  // "/" is about to open a replay, so it shows the same placeholder as a loading replay.
  const racePending = home ? !seasons.isError : raceId != null && race.isPending
  if (racePending) return <BreadcrumbPlaceholder crumbs={3} />

  const current = raceId ? race.data : undefined
  const year = current?.season ?? (Number(params.get('year')) || seasons.data?.[0]?.year)
  const series = current?.series_id ?? (Number(params.get('series')) || 1)
  if (!year) return seasons.isPending ? <BreadcrumbPlaceholder crumbs={2} /> : null

  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb">
      <YearCrumb year={year} series={series} />
      <ChevronRight size={14} className="shrink-0 text-faint" />
      <SeriesCrumb year={year} series={series} />
      {current && (
        <>
          <ChevronRight size={14} className="shrink-0 text-faint" />
          <RaceCrumb year={year} series={series} raceId={current.race_id} name={current.race_name ?? 'Race'} />
        </>
      )}
    </nav>
  )
}

const PLACEHOLDER_WIDTHS = ['w-10', 'w-24', 'w-48']

/** Pulsing stand-ins for the first `crumbs` crumbs while the data behind them loads. */
function BreadcrumbPlaceholder({ crumbs }: { crumbs: number }) {
  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb" aria-busy>
      {PLACEHOLDER_WIDTHS.slice(0, crumbs).map((width, i) => (
        <Fragment key={width}>
          {i > 0 && <ChevronRight size={14} className="shrink-0 text-faint" />}
          <span className={clsx('mx-2 h-4 min-w-0 shrink animate-pulse rounded bg-hover', width)} />
        </Fragment>
      ))}
    </nav>
  )
}

function Crumb({ label, children, wide }: { label: string; children: (close: () => void) => React.ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        className={clsx(
          'flex min-w-0 items-center gap-1 rounded-md px-2 py-1 font-medium transition hover:bg-raised',
          open ? 'bg-raised text-ink' : 'text-muted hover:text-ink',
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className={clsx(
            'z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl shadow-black/60',
            wide ? 'w-[24rem]' : 'w-44',
          )}
        >
          {children(() => setOpen(false))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function MenuItem({ active, onClick, children, disabled }: { active?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-raised disabled:opacity-30',
        active && 'bg-raised font-semibold',
      )}
    >
      {children}
    </button>
  )
}

function YearCrumb({ year, series }: { year: number; series: number }) {
  const seasons = useSeasons()
  const navigate = useNavigate()
  return (
    <Crumb label={String(year)}>
      {(close) => (
        <div className="py-1">
          {seasons.data?.map((s) => (
            <MenuItem
              key={s.year}
              active={s.year === year}
              onClick={() => {
                close()
                const keep = s.series.some((x) => x.series_id === series) ? series : s.series[0]?.series_id
                navigate(`/races?year=${s.year}&series=${keep}`)
              }}
            >
              {s.year}
              <span className="text-[11px] text-faint">{s.series.reduce((n, x) => n + x.race_count, 0)} races</span>
            </MenuItem>
          ))}
        </div>
      )}
    </Crumb>
  )
}

function SeriesCrumb({ year, series }: { year: number; series: number }) {
  const seasons = useSeasons()
  const navigate = useNavigate()
  const available = seasons.data?.find((s) => s.year === year)?.series ?? []
  return (
    <Crumb label={seriesName(series)}>
      {(close) => (
        <div className="py-1">
          {SERIES.map((s) => {
            const count = available.find((x) => x.series_id === s.id)?.race_count
            return (
              <MenuItem
                key={s.id}
                active={s.id === series}
                disabled={!count}
                onClick={() => {
                  close()
                  navigate(`/races?year=${year}&series=${s.id}`)
                }}
              >
                {s.name}
                {count != null && <span className="text-[11px] text-faint">{count}</span>}
              </MenuItem>
            )
          })}
        </div>
      )}
    </Crumb>
  )
}

function RaceCrumb({ year, series, raceId, name }: { year: number; series: number; raceId: number; name: string }) {
  // Filters the season listing, which the home page has usually fetched already.
  const season = useRaces({ year })
  const races = season.data?.filter((r) => r.series_id === series)
  return (
    <Crumb label={name} wide>
      {(close) => (
        <>
          <div className="border-b border-line px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
            {year} {seriesName(series)}
          </div>
          {races ? <RaceRows races={races} currentId={raceId} onPick={close} /> : <div className="p-4 text-xs text-faint">Loading…</div>}
        </>
      )}
    </Crumb>
  )
}
