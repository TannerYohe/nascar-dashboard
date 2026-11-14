import * as Popover from '@radix-ui/react-popover'
import { clsx } from 'clsx'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router'

import { useReplayRace, useSeasons, useSeriesRaces } from '../api/client'
import { CommandPalette } from '../features/picker/CommandPalette'
import { RaceRows } from '../features/picker/RaceList'
import { APP_NAME } from '../lib/brand'
import { SERIES, seriesName } from '../lib/racing'

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  // Below lg there's only room for one of the page links and the breadcrumb: the replay screen keeps
  // its breadcrumb, and the other pages keep their links.
  const onReplay = useMatch('/replay/:raceId') != null
  // The year and series breadcrumb belongs to the pages that show one season.
  const seasonal = [useMatch('/'), useMatch('/races'), useMatch('/standings')].some(Boolean) || onReplay
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur">
        <Link to="/" className="flex shrink-0 items-center gap-2.5 font-bold tracking-tight">
          <img src="/favicon.svg" alt="" className="h-7 w-7" />
          <span className="sr-only sm:not-sr-only">{APP_NAME}</span>
        </Link>
        <PageNav className={onReplay ? 'hidden lg:flex' : 'flex'} />
        {seasonal && (
          <>
            <span className="hidden h-5 w-px shrink-0 bg-line lg:block" aria-hidden />
            <div className={clsx('min-w-0', !onReplay && 'hidden lg:block')}>
              <Breadcrumb />
            </div>
          </>
        )}
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-faint transition hover:border-line-strong hover:text-muted"
          aria-label="Search races"
        >
          <Search size={14} />
          <span className="hidden xl:inline">Search races</span>
          <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] xl:inline">Ctrl K</kbd>
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

/** `?year=&series=` and `?series=` for the season or series being viewed: the replayed race's, or the page's own. */
function useViewedQueries(): { season: string; series: string } {
  const replay = useMatch('/replay/:raceId')
  const race = useReplayRace(replay ? Number(replay.params.raceId) : undefined)
  const [params] = useSearchParams()
  const year = replay ? race.data?.season : Number(params.get('year')) || undefined
  const series = replay ? race.data?.series_id : Number(params.get('series')) || undefined
  return {
    season: year ? `?year=${year}${series ? `&series=${series}` : ''}` : series ? `?series=${series}` : '',
    series: series ? `?series=${series}` : '',
  }
}

/** Links to every page. On narrow screens it scrolls sideways, keeping the current page in view. */
function PageNav({ className }: { className: string }) {
  const { season, series } = useViewedQueries()
  const { pathname } = useLocation()
  const nav = useRef<HTMLElement>(null)
  useEffect(() => {
    const reveal = () => nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    reveal()
    // Link widths change once the web font loads.
    void document.fonts.ready.then(reveal)
  }, [pathname])
  return (
    <nav
      ref={nav}
      className={clsx(
        'no-scrollbar min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:gap-1',
        className,
      )}
      aria-label="Pages"
    >
      <PageLink to={`/races${season}`}>Races</PageLink>
      <PageLink to={`/standings${season}`}>Standings</PageLink>
      <PageLink to={`/drivers${series}`}>Drivers</PageLink>
      <PageLink to={`/teams${series}`}>Teams</PageLink>
      <PageLink to={`/tracks${series}`}>Tracks</PageLink>
    </nav>
  )
}

function PageLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        clsx('shrink-0 rounded-md px-2 py-1 font-medium transition hover:bg-raised', isActive ? 'text-ink' : 'text-faint hover:text-muted')
      }
    >
      {children}
    </NavLink>
  )
}

/** Year › Series › Race, each one a popover to change that level. */
function Breadcrumb() {
  const home = useMatch('/')
  const replay = useMatch('/replay/:raceId')
  const page = useMatch('/standings') ? '/standings' : '/races'
  const raceId = replay ? Number(replay.params.raceId) : undefined
  const race = useReplayRace(raceId)
  const [params] = useSearchParams()
  const seasons = useSeasons()

  // Shows three placeholder crumbs on "/" and while the replay loads.
  const racePending = home ? !seasons.isError : raceId != null && race.isPending
  if (racePending) return <BreadcrumbPlaceholder crumbs={3} />

  const current = raceId ? race.data : undefined
  const year = current?.season ?? (Number(params.get('year')) || seasons.data?.[0]?.year)
  const series = current?.series_id ?? (Number(params.get('series')) || 1)
  if (!year) return seasons.isPending ? <BreadcrumbPlaceholder crumbs={2} /> : null

  return (
    <BreadcrumbNav>
      <YearCrumb year={year} series={series} page={page} />
      <CrumbSeparator />
      <SeriesCrumb year={year} series={series} page={page} />
      {current && (
        <>
          <CrumbSeparator />
          <RaceCrumb year={year} series={series} raceId={current.race_id} name={current.race_name ?? 'Race'} />
        </>
      )}
    </BreadcrumbNav>
  )
}

function BreadcrumbNav({ busy, children }: { busy?: boolean; children: React.ReactNode }) {
  return (
    <nav className="flex min-w-0 items-center gap-1 text-sm" aria-label="Breadcrumb" aria-busy={busy}>
      {children}
    </nav>
  )
}

function CrumbSeparator() {
  return <ChevronRight size={14} className="shrink-0 text-faint" />
}

const PLACEHOLDER_WIDTHS = ['w-10', 'w-24', 'w-48']

/** Pulsing stand-ins for the first `crumbs` crumbs while the data behind them loads. */
function BreadcrumbPlaceholder({ crumbs }: { crumbs: number }) {
  return (
    <BreadcrumbNav busy>
      {PLACEHOLDER_WIDTHS.slice(0, crumbs).map((width, i) => (
        <Fragment key={width}>
          {i > 0 && <CrumbSeparator />}
          <span className={clsx('mx-2 h-4 min-w-0 shrink animate-pulse rounded bg-hover', width)} />
        </Fragment>
      ))}
    </BreadcrumbNav>
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

function YearCrumb({ year, series, page }: { year: number; series: number; page: string }) {
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
                navigate(`${page}?year=${s.year}&series=${keep}`)
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

function SeriesCrumb({ year, series, page }: { year: number; series: number; page: string }) {
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
                  navigate(`${page}?year=${year}&series=${s.id}`)
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
  const races = useSeriesRaces(year, series).data
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
