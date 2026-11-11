import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { DriverSeason, SeasonStandings } from '../../api/types'
import { cleanName, shortDate, surname } from '../../lib/format'
import {
  type ChartMode,
  chartValue,
  divider,
  formatValue,
  highlightColor,
  niceTicks,
  phaseOf,
  phases,
  spreadLabels,
} from './model'

const HEIGHT = 400
const M = { top: 28, right: 140, bottom: 28, left: 44 }
// Below this width, end labels drop their values to leave room for the plot.
const NARROW = 640
const NARROW_RIGHT = 84
const HOVER_REACH = 12
const LABEL_GAP = 15

interface Props {
  standings: SeasonStandings
  drivers: DriverSeason[]
  mode: ChartMode
  highlights: Map<number, number>
  hoverId: number | null
  selected: number
  onHover: (driverId: number | null) => void
  onSelect: (race: number) => void
  onToggle: (driverId: number) => void
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Each driver's championship standing after every race, one line per driver. */
export function PointsChart({ standings: s, drivers, mode, highlights, hoverId, selected, onHover, onSelect, onToggle }: Props) {
  const [ref, width] = useWidth()
  const [pointer, setPointer] = useState<{ race: number; x: number; y: number } | null>(null)

  const n = s.races.length
  const through = s.standings_through
  const narrow = width < NARROW
  const right = narrow ? NARROW_RIGHT : M.right
  const plotW = Math.max(0, width - M.left - right)
  const plotH = HEIGHT - M.top - M.bottom
  const step = n ? plotW / n : 0
  const x = (i: number) => M.left + (i + 0.5) * step

  const values = useMemo(
    () => new Map(drivers.map((d) => [d.driver_id, Array.from({ length: through }, (_, i) => chartValue(s, d, i, mode))])),
    [s, drivers, mode, through],
  )

  const { y, ticks } = useMemo(() => {
    const all = [...values.values()].flat().filter((v): v is number => v != null)
    if (mode === 'position') {
      const max = Math.max(2, ...all)
      const ticks = [1, ...niceTicks(1, max).filter((t) => t > 1)]
      return { y: (v: number) => M.top + ((v - 1) / (max - 1)) * plotH, ticks }
    }
    if (mode === 'gap') {
      const min = Math.min(-1, ...all)
      return { y: (v: number) => M.top + (v / min) * plotH, ticks: niceTicks(min, 0) }
    }
    const max = Math.max(1, ...all)
    return { y: (v: number) => M.top + plotH - (v / max) * plotH, ticks: niceTicks(0, max) }
  }, [values, mode, plotH])

  const path = (d: DriverSeason) => {
    let out = ''
    let pen = false
    values.get(d.driver_id)?.forEach((v, i) => {
      if (v == null) {
        pen = false
        return
      }
      out += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return out
  }

  const nearestDriver = (race: number, py: number) => {
    let best: number | null = null
    let bestDistance = HOVER_REACH
    for (const d of drivers) {
      const v = values.get(d.driver_id)?.[race]
      if (v == null) continue
      const distance = Math.abs(y(v) - py)
      if (distance < bestDistance) {
        best = d.driver_id
        bestDistance = distance
      }
    }
    return best
  }

  /** The race and nearest driver line under a pointer or click, in chart coordinates. */
  const hit = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const px = e.clientX - box.left
    const py = e.clientY - box.top
    const race = Math.min(through - 1, Math.max(0, Math.floor((px - M.left) / step)))
    return { race, driverId: nearestDriver(race, py), x: px, y: py }
  }

  const onPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    const { race, driverId, x: px, y: py } = hit(e)
    setPointer({ race, x: px, y: py })
    onHover(driverId)
  }

  const onPointerLeave = () => {
    setPointer(null)
    onHover(null)
  }

  const onClick = (e: React.MouseEvent<SVGRectElement>) => {
    const { race, driverId } = hit(e)
    onSelect(race)
    if (driverId != null) onToggle(driverId)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') onSelect(Math.max(0, selected - 1))
    else if (e.key === 'ArrowRight') onSelect(Math.min(through - 1, selected + 1))
    else return
    e.preventDefault()
  }

  const featured = drivers.filter((d) => highlights.has(d.driver_id) || d.driver_id === hoverId)
  const background = drivers.filter((d) => !featured.includes(d))
  const labels = featured.flatMap((d) => {
    const line = values.get(d.driver_id) ?? []
    const last = line.findLastIndex((v) => v != null)
    return last < 0 ? [] : [{ d, last, value: line[last]! }]
  })
  const labelYs = spreadLabels(
    labels.map((l) => y(l.value)),
    LABEL_GAP,
    M.top,
    M.top + plotH,
  )

  const color = (d: DriverSeason) => {
    const slot = highlights.get(d.driver_id)
    return slot == null ? 'var(--color-ink)' : highlightColor(slot)
  }

  return (
    <div ref={ref} className="relative w-full select-none">
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Championship ${mode} after each race. Use the arrow keys to move between races.`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <PhaseBands standings={s} x={x} step={step} />

          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="tabular fill-faint text-[11px]">
                {mode === 'position' ? t : formatValue(t, mode).replace('Leader', '0')}
              </text>
            </g>
          ))}

          {mode === 'position' && <Cutlines standings={s} x={x} y={y} step={step} />}

          <XAxis standings={s} x={x} plotW={plotW} />

          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={M.top}
            y2={M.top + plotH}
            stroke="var(--color-accent)"
            strokeOpacity={0.55}
          />
          {pointer && (
            <line x1={x(pointer.race)} x2={x(pointer.race)} y1={M.top} y2={M.top + plotH} stroke="var(--color-line-strong)" />
          )}

          <g fill="none" strokeLinejoin="round" strokeLinecap="round">
            {background.map((d) => (
              <path key={d.driver_id} d={path(d)} stroke="var(--color-line-strong)" strokeWidth={1.25} />
            ))}
            {featured.map((d) => (
              <g key={d.driver_id}>
                <path d={path(d)} stroke="var(--color-panel)" strokeWidth={6} />
                <path d={path(d)} stroke={color(d)} strokeWidth={2} />
              </g>
            ))}
          </g>

          {featured.map((d) => {
            const race = pointer?.race ?? selected
            const v = values.get(d.driver_id)?.[race]
            return v == null ? null : (
              <circle key={d.driver_id} cx={x(race)} cy={y(v)} r={4} fill={color(d)} stroke="var(--color-panel)" strokeWidth={2} />
            )
          })}

          {labels.map(({ d, last, value }, k) => (
            <g key={d.driver_id} transform={`translate(${x(last) + 10},${labelYs[k]})`}>
              <line x1={0} x2={10} stroke={color(d)} strokeWidth={2} strokeLinecap="round" />
              <text x={15} dy="0.32em" className="fill-ink text-[11px] font-semibold">
                {surname(d.name)}
                {!narrow && <tspan className="tabular fill-muted font-normal"> {formatValue(value, mode)}</tspan>}
              </text>
            </g>
          ))}

          <rect
            x={M.left}
            y={M.top}
            width={Math.max(0, x(through - 1) + step / 2 - M.left)}
            height={plotH}
            fill="transparent"
            className={hoverId != null ? 'cursor-pointer' : 'cursor-crosshair'}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onClick={onClick}
          />
        </svg>
      )}
      {pointer && (
        <Tooltip
          standings={s}
          race={pointer.race}
          left={pointer.x}
          top={pointer.y}
          width={width}
          rows={featured.map((d) => ({ d, value: values.get(d.driver_id)?.[pointer.race] ?? null, color: color(d) }))}
          mode={mode}
          hoverId={hoverId}
        />
      )}
    </div>
  )
}

function PhaseBands({ standings: s, x, step }: { standings: SeasonStandings; x: (i: number) => number; step: number }) {
  return (
    <g>
      {phases(s).map((p, k) => {
        const left = x(p.start) - step / 2
        const width = (p.end - p.start + 1) * step
        const label = width > p.label.length * 6.5 + 12 ? p.label : p.short
        return (
          <g key={p.start}>
            {p.playoff && (
              <rect x={left} y={M.top} width={width} height={HEIGHT - M.top - M.bottom} fill="var(--color-raised)" opacity={k % 2 ? 0.55 : 0.85} />
            )}
            {k > 0 && <line x1={left} x2={left} y1={8} y2={HEIGHT - M.bottom} stroke="var(--color-line-strong)" />}
            <text x={left + 6} y={18} className={p.playoff ? 'fill-accent text-[11px] font-semibold' : 'fill-muted text-[11px] font-semibold'}>
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

/** The line between the playoff field and everyone else, phase by phase. */
function Cutlines({ standings: s, x, y, step }: { standings: SeasonStandings; x: (i: number) => number; y: (v: number) => number; step: number }) {
  return (
    <g>
      {phases(s).map((p) => {
        const cut = divider(s, p.start)
        if (!cut || !cut.after) return null
        const left = x(p.start) - step / 2
        const right = x(p.end) + step / 2
        const at = y(cut.after + 0.5)
        return (
          <g key={p.start}>
            <line x1={left} x2={right} y1={at} y2={at} stroke="var(--color-accent)" strokeOpacity={0.6} />
            {right - left > cut.label.length * 7 + 12 && (
              <text x={right - 6} y={at - 5} textAnchor="end" className="fill-accent/80 text-[10px] font-semibold uppercase tracking-wider">
                {cut.label}
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function XAxis({ standings: s, x, plotW }: { standings: SeasonStandings; x: (i: number) => number; plotW: number }) {
  const n = s.races.length
  const every = Math.max(1, Math.ceil((n * 26) / Math.max(plotW, 1)))
  return (
    <g>
      <line x1={M.left} x2={M.left + plotW} y1={HEIGHT - M.bottom} y2={HEIGHT - M.bottom} stroke="var(--color-line-strong)" />
      {s.races.map((r, i) =>
        (i + 1) % every ? null : (
          <text
            key={r.race_id}
            x={x(i)}
            y={HEIGHT - M.bottom + 16}
            textAnchor="middle"
            className={i < s.standings_through ? 'tabular fill-faint text-[11px]' : 'tabular fill-faint/40 text-[11px]'}
          >
            {r.round ?? i + 1}
          </text>
        ),
      )}
    </g>
  )
}

interface TooltipProps {
  standings: SeasonStandings
  race: number
  left: number
  top: number
  width: number
  rows: { d: DriverSeason; value: number | null; color: string }[]
  mode: ChartMode
  hoverId: number | null
}

function Tooltip({ standings: s, race, left, top, width, rows, mode, hoverId }: TooltipProps) {
  const r = s.races[race]
  const phase = phaseOf(s, race)
  // Biggest number first for points, best position first otherwise.
  const sorted = [...rows].sort((a, b) =>
    mode === 'points' || mode === 'gap' ? (b.value ?? -1e9) - (a.value ?? -1e9) : (a.value ?? 1e9) - (b.value ?? 1e9),
  )
  const flip = left > width - 260
  return (
    <div
      className="pointer-events-none absolute z-10 w-60 rounded-lg border border-line bg-panel/95 p-3 text-xs shadow-2xl shadow-black/60 backdrop-blur"
      style={{ left: flip ? left - 252 : left + 12, top: Math.min(top + 12, HEIGHT - 160) }}
    >
      <div className="font-semibold text-ink">{r.race_name}</div>
      <div className="mt-0.5 text-faint">
        Race {r.round} · {phase?.label}
        {r.race_date && ` · ${shortDate(r.race_date)}`}
      </div>
      {sorted.length > 0 && (
        <ul className="mt-2 space-y-1">
          {sorted.map(({ d, value, color }) => (
            <li key={d.driver_id} className="flex items-center gap-2">
              <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} />
              <span className="tabular w-12 font-semibold text-ink">{formatValue(value, mode)}</span>
              <span className={d.driver_id === hoverId ? 'truncate text-ink' : 'truncate text-muted'}>{cleanName(d.name)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
