import { ChevronsLeft, ChevronsRight, Pause, Play, SkipBack } from 'lucide-react'
import { useMemo } from 'react'

import { FLAG } from '../../lib/racing'
import { lapStartTime, type RaceModel } from './engine/model'
import type { RaceState } from './engine/snapshot'
import { SPEEDS, useReplayStore } from './store'

interface Props {
  model: RaceModel
  state: RaceState
  /** Cars the timeline should mark penalties for (the visible ones). */
  visibleCars: Set<number>
}

export function Controls({ model, state, visibleCars }: Props) {
  const playing = useReplayStore((s) => s.playing)
  const speed = useReplayStore((s) => s.speed)
  const t = useReplayStore((s) => s.t)
  const { toggle, seek, setSpeed } = useReplayStore.getState()
  const duration = model.duration

  const stepLap = (delta: number) => {
    const target = Math.max(1, Math.min(model.totalLaps, state.lap + delta))
    seek(lapStartTime(model, target) + 0.01)
  }

  return (
    <div className="flex flex-col gap-2">
      <Timeline model={model} t={t} visibleCars={visibleCars} onSeek={seek} />
      <div className="flex items-center gap-2">
        <IconButton label="Restart" onClick={() => seek(0)}>
          <SkipBack size={16} />
        </IconButton>
        <IconButton label="Previous lap ( ← )" onClick={() => stepLap(-1)}>
          <ChevronsLeft size={18} />
        </IconButton>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause (space)' : 'Play (space)'}
          title={playing ? 'Pause (space)' : 'Play (space)'}
          className="grid h-10 w-10 place-items-center rounded-full bg-ink text-bg transition hover:scale-105"
        >
          {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
        </button>
        <IconButton label="Next lap ( → )" onClick={() => stepLap(1)}>
          <ChevronsRight size={18} />
        </IconButton>

        <div className="ml-2 flex items-center rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={`tabular rounded-md px-2 py-1 font-mono text-xs transition ${
                s === speed ? 'bg-raised text-ink shadow' : 'text-faint hover:text-muted'
              }`}
            >
              {s < 1 ? `${s}×`.replace('0.', '.') : `${s}×`}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden text-[11px] text-faint md:block">
          Space play/pause · ←/→ lap · [ ] speed
        </span>
      </div>
      <span className="sr-only">
        {Math.round((t / Math.max(1, duration)) * 100)}% through the race
      </span>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-raised hover:text-ink"
    >
      {children}
    </button>
  )
}

interface TimelineProps {
  model: RaceModel
  t: number
  visibleCars: Set<number>
  onSeek: (t: number) => void
}

/** Scrubber with caution bands, stage ends and penalty ticks drawn under it. */
function Timeline({ model, t, visibleCars, onSeek }: TimelineProps) {
  const duration = Math.max(1, model.duration)
  const pct = (time: number) => `${Math.max(0, Math.min(100, (time / duration) * 100))}%`

  const bands = useMemo(() => {
    const out: { start: number; end: number; flag: number }[] = []
    const flags = model.lapFlags
    for (let lap = 1; lap <= model.totalLaps; lap++) {
      const f = flags[lap]
      if (f !== FLAG.YELLOW && f !== FLAG.RED) continue
      const start = lapStartTime(model, lap)
      const end = model.leaderCross[lap] ?? start
      const last = out.at(-1)
      if (last && last.flag === f && Math.abs(last.end - start) < 0.5) last.end = end
      else out.push({ start, end, flag: f })
    }
    return out
  }, [model])

  const penaltyTicks = useMemo(
    () => model.events.filter((e) => e.kind === 'penalty' && e.t > 0 && e.cars.some((c) => visibleCars.has(c))),
    [model, visibleCars],
  )

  return (
    <div className="relative h-8">
      <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-raised">
        <div className="absolute inset-y-0 left-0 bg-line-strong" style={{ width: pct(t) }} />
        {bands.map((b) => (
          <div
            key={b.start}
            className="absolute inset-y-0"
            style={{
              left: pct(b.start),
              width: `max(2px, calc(${pct(b.end)} - ${pct(b.start)}))`,
              background: b.flag === FLAG.RED ? 'var(--color-flag-red)' : 'var(--color-flag-yellow)',
              opacity: 0.85,
            }}
            title={b.flag === FLAG.RED ? 'Red flag' : 'Caution'}
          />
        ))}
      </div>
      {model.stageEnds.slice(0, -1).map((end, i) => (
        <div
          key={end}
          className="pointer-events-none absolute top-0 h-full w-px bg-muted/60"
          style={{ left: pct(model.leaderCross[end] ?? 0) }}
        >
          <span className="absolute -top-3 -translate-x-1/2 text-[9px] font-semibold text-faint">S{i + 1}</span>
        </div>
      ))}
      {penaltyTicks.map((e) => (
        <div
          key={e.id}
          className="pointer-events-none absolute bottom-0 h-1.5 w-1 -translate-x-1/2 rounded-sm bg-orange-400"
          style={{ left: pct(e.t) }}
        />
      ))}
      <input
        type="range"
        className="scrubber absolute inset-0 h-full"
        min={0}
        max={duration}
        step={0.1}
        value={Math.max(0, t)}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Race position"
      />
    </div>
  )
}
