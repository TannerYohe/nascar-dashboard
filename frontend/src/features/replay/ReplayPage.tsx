import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router'

import { useReplay } from '../../api/client'
import { Problem } from '../../components/Problem'
import type { ReplayBundle } from '../../api/types'
import { longDate } from '../../lib/format'
import { flagStyle, seriesName } from '../../lib/racing'
import { CarFilter } from './CarFilter'
import { Controls } from './Controls'
import { buildModel, lapSeekTime, type RaceModel } from './engine/model'
import { raceStateAt, standingsAt } from './engine/snapshot'
import { Leaderboard } from './Leaderboard'
import { RaceHeader } from './RaceHeader'
import { SidePanel } from './SidePanel'
import { startClockLoop, useReplayStore } from './store'
import { TrackView } from './TrackView'

export function ReplayPage() {
  const { raceId } = useParams()
  const id = Number(raceId)
  const { data, error, isLoading } = useReplay(id)

  if (isLoading) return <Loading />
  if (error || !data) return <Problem title="Couldn't load this race" detail={String(error ?? 'Not found')} />
  if (!data.laps.length) return <NoLapData bundle={data} />
  return <Replay key={id} bundle={data} />
}

function Replay({ bundle }: { bundle: ReplayBundle }) {
  const model = useMemo(() => buildModel(bundle), [bundle])
  const [params] = useSearchParams()
  // ?lap=120 opens the replay at the start of that lap; ?t=2215 at that many
  // seconds after the green.
  const startLap = Number(params.get('lap')) || 0
  const startT = Number(params.get('t')) || 0

  useEffect(() => {
    const start = startT > 0 ? startT : startLap > 1 ? lapSeekTime(model, startLap) : 0
    useReplayStore.getState().reset(model.duration, start)
    const stop = startClockLoop()
    document.title = `${bundle.race.race_name ?? 'Race'} · Race Rewind`
    return () => {
      stop()
      useReplayStore.getState().pause()
    }
    // Only on load: the lap in the URL is where the replay starts, not a binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, bundle.race.race_name])

  useKeyboard(model)

  const t = useReplayStore((s) => s.t)
  const hidden = useReplayStore((s) => s.hidden)
  const state = useMemo(() => raceStateAt(model, t), [model, t])
  const rows = useMemo(() => standingsAt(model, t), [model, t])
  const visibleCars = useMemo(
    () => new Set(model.cars.filter((c) => !hidden.has(c.driverId) && c.car != null).map((c) => c.car!)),
    [model, hidden],
  )
  const flagColor = flagStyle(state.flag).color

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[minmax(340px,400px)_minmax(0,1fr)_minmax(300px,340px)] lg:overflow-hidden">
      <section className="order-2 flex min-h-[420px] flex-col rounded-xl border border-line bg-panel pt-3 lg:order-1 lg:min-h-0">
        <Leaderboard model={model} rows={rows} t={t} />
      </section>

      <section className="order-1 flex min-h-0 flex-col gap-3 lg:order-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              {seriesName(bundle.race.series_id)} · {bundle.race.season}
              {bundle.race.round != null && ` · Round ${bundle.race.round}`}
            </div>
            <h1 className="truncate text-xl font-bold tracking-tight">{bundle.race.race_name}</h1>
            <div className="text-xs text-muted">
              {bundle.race.track_name} · {longDate(bundle.race.race_date)}
            </div>
          </div>
          <CarFilter model={model} rows={rows} />
        </div>

        <div
          className="relative flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border bg-panel transition-colors duration-500"
          style={{ borderColor: `color-mix(in srgb, ${flagColor} 55%, transparent)`, boxShadow: `inset 0 0 60px -30px ${flagColor}` }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5">
            <RaceHeader model={model} state={state} />
          </div>
          <div className="min-h-0 flex-1 p-2">
            <TrackView model={model} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-panel px-4 pb-3 pt-4">
          <Controls model={model} state={state} visibleCars={visibleCars} />
        </div>
      </section>

      <section className="order-3 flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-line bg-panel lg:min-h-0">
        <SidePanel model={model} rows={rows} t={t} visibleCars={visibleCars} />
      </section>
    </div>
  )
}

function useKeyboard(model: RaceModel) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const s = useReplayStore.getState()
      const lap = raceStateAt(model, s.t).lap
      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.toggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          s.seek(lapSeekTime(model, lap + (e.shiftKey ? 10 : 1)))
          break
        case 'ArrowLeft':
          e.preventDefault()
          s.seek(lapSeekTime(model, lap - (e.shiftKey ? 10 : 1)))
          break
        case ']':
          s.faster()
          break
        case '[':
          s.slower()
          break
        case 'Home':
          s.seek(0)
          break
        case 'Escape':
          if (s.selected != null) s.select(s.selected)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [model])
}

function Loading() {
  return (
    <div className="grid flex-1 place-items-center">
      <div className="flex items-center gap-3 text-sm text-muted">
        <span className="h-2 w-2 animate-ping rounded-full bg-accent" />
        Loading race data…
      </div>
    </div>
  )
}

function NoLapData({ bundle }: { bundle: ReplayBundle }) {
  const r = bundle.race
  const scheduled = r.status === 'scheduled'
  return (
    <Problem
      title={r.race_name ?? 'Race'}
      detail={
        scheduled
          ? `${r.track_name} · ${longDate(r.race_date)}. This race hasn't run yet. It'll be ready to replay once lap data arrives.`
          : `${r.track_name} · ${longDate(r.race_date)}. There's no lap-by-lap data for this race, so it can't be replayed.`
      }
    />
  )
}
