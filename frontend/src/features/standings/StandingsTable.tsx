import { clsx } from 'clsx'
import { Fragment } from 'react'

import type { DriverSeason, SeasonStandings } from '../../api/types'
import { divider, highlightColor, positionChange, type Status, standingsAt, status } from './model'

interface Props {
  standings: SeasonStandings
  race: number
  highlights: Map<number, number>
  hoverId: number | null
  onHover: (driverId: number | null) => void
  onToggle: (driverId: number) => void
}

const STATUS_STYLE: Record<Status['tone'], string> = {
  champion: 'bg-accent text-black',
  alive: 'border border-line-strong text-muted',
  out: 'text-faint',
}

/** The standings after one race. Clicking a driver highlights them on the chart. */
export function StandingsTable({ standings: s, race, highlights, hoverId, onHover, onToggle }: Props) {
  const rows = standingsAt(s, race)
  const cut = divider(s, race)
  const worst = Math.max(...s.drivers.flatMap((d) => d.positions.filter((p): p is number => p != null)))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wider text-faint">
            <th className="py-2 pr-2 pl-3 text-right">Pos</th>
            <th className="px-1" aria-label="Change since the previous race" />
            <th className="px-2">Driver</th>
            <th className="px-2 text-right">Points</th>
            <th className="px-2 text-right">Gap</th>
            <th className="hidden px-2 text-right sm:table-cell" title="Points earned in this race">Race</th>
            <th className="px-2 text-right">Wins</th>
            <th className="hidden px-2 text-right md:table-cell">Top 5</th>
            <th className="hidden px-2 text-right md:table-cell">Top 10</th>
            <th className="hidden px-2 lg:table-cell">Season</th>
            <th className="px-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, k) => (
            <Fragment key={d.driver_id}>
              <Row
                d={d}
                standings={s}
                race={race}
                worst={worst}
                slot={highlights.get(d.driver_id)}
                hovered={d.driver_id === hoverId}
                onHover={onHover}
                onToggle={onToggle}
              />
              {cut && k + 1 === cut.after && k + 1 < rows.length && (
                <tr aria-hidden>
                  <td colSpan={11} className="p-0">
                    <div className="flex items-center gap-2 py-1 pl-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-accent/80">{cut.label}</span>
                      <span className="h-px flex-1 bg-accent/50" />
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface RowProps {
  d: DriverSeason
  standings: SeasonStandings
  race: number
  worst: number
  slot: number | undefined
  hovered: boolean
  onHover: (driverId: number | null) => void
  onToggle: (driverId: number) => void
}

function Row({ d, standings: s, race, worst, slot, hovered, onHover, onToggle }: RowProps) {
  const change = positionChange(d, race)
  const gap = d.gap_to_leader[race]
  const tag = status(s, d, race)
  return (
    <tr
      onPointerEnter={() => onHover(d.driver_id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onToggle(d.driver_id)}
      aria-selected={slot != null}
      className={clsx(
        'cursor-pointer border-b border-line/60 transition-colors',
        hovered ? 'bg-hover' : slot != null ? 'bg-raised/60' : 'hover:bg-raised/40',
      )}
    >
      <td className="tabular py-1.5 pr-2 pl-3 text-right font-semibold">{d.positions[race]}</td>
      <td className="tabular px-1 text-[11px]">
        {change ? (
          <span className={change > 0 ? 'text-flag-green' : 'text-flag-red'}>
            {change > 0 ? '▲' : '▼'}
            {Math.abs(change)}
          </span>
        ) : null}
      </td>
      <td className="max-w-56 px-2">
        <div className="flex items-center gap-2">
          <span
            className="h-0.5 w-3 shrink-0 rounded-full"
            style={{ background: slot != null ? highlightColor(slot) : 'transparent' }}
            aria-hidden
          />
          <span className="tabular w-7 shrink-0 text-right text-xs text-faint">#{d.car_number ?? '–'}</span>
          <span className="truncate font-medium">{d.name}</span>
          {d.is_rookie && (
            <span className="rounded border border-line-strong px-1 text-[10px] font-semibold text-muted" title="Rookie">
              R
            </span>
          )}
        </div>
      </td>
      <td className="tabular px-2 text-right font-semibold">{d.points[race]?.toLocaleString() ?? '–'}</td>
      <td className="tabular px-2 text-right text-muted">{gap ? `−${Math.abs(gap).toLocaleString()}` : gap === 0 ? '—' : '–'}</td>
      <td className="tabular hidden px-2 text-right text-muted sm:table-cell">{d.earned[race] ?? '–'}</td>
      <td className="tabular px-2 text-right">{d.wins[race] || <span className="text-faint">0</span>}</td>
      <td className="tabular hidden px-2 text-right text-muted md:table-cell">{d.top_5[race] ?? '–'}</td>
      <td className="tabular hidden px-2 text-right text-muted md:table-cell">{d.top_10[race] ?? '–'}</td>
      <td className="hidden px-2 lg:table-cell">
        <Sparkline positions={d.positions.slice(0, race + 1)} total={s.races.length} worst={worst} color={slot != null ? highlightColor(slot) : 'var(--color-muted)'} />
      </td>
      <td className="px-2 pr-3">
        {tag && (
          <span className={clsx('whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', STATUS_STYLE[tag.tone])}>
            {tag.label}
          </span>
        )}
      </td>
    </tr>
  )
}

const SPARK_W = 88
const SPARK_H = 20

/** Championship position over the season so far; higher is better. */
function Sparkline({ positions, total, worst, color }: { positions: (number | null)[]; total: number; worst: number; color: string }) {
  const step = SPARK_W / Math.max(total - 1, 1)
  const y = (p: number) => 2 + ((p - 1) / Math.max(worst - 1, 1)) * (SPARK_H - 4)
  let d = ''
  let pen = false
  positions.forEach((p, i) => {
    if (p == null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${(i * step).toFixed(1)},${y(p).toFixed(1)}`
    pen = true
  })
  return (
    <svg width={SPARK_W} height={SPARK_H} aria-hidden className="block">
      <line x1={0} x2={SPARK_W} y1={y(1)} y2={y(1)} stroke="var(--color-line)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
