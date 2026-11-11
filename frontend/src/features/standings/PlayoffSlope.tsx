import type { SeasonStandings } from '../../api/types'
import { surname } from '../../lib/format'
import { highlightColor } from './model'

const ROW = 22
const W = 320
const LEFT = 128
const RIGHT = 192

interface Props {
  standings: SeasonStandings
  race: number
  highlights: Map<number, number>
  hoverId: number | null
  onHover: (driverId: number | null) => void
  onToggle: (driverId: number) => void
}

/** Where each playoff driver was seeded, joined to where they stand after `race`. */
export function PlayoffSlope({ standings: s, race, highlights, hoverId, onHover, onToggle }: Props) {
  const field = s.drivers
    .filter((d) => d.playoff_seed != null && d.positions[race] != null)
    .sort((a, b) => a.playoff_seed! - b.playoff_seed!)
  const ranked = [...field].sort((a, b) => a.positions[race]! - b.positions[race]!)
  const rankOf = new Map(ranked.map((d, k) => [d.driver_id, k + 1]))
  const y = (k: number) => 28 + (k - 1) * ROW
  const height = y(field.length) + 12

  // Draw highlighted and hovered lines last so they sit on top.
  const order = [...field].sort((a, b) => Number(highlights.has(a.driver_id) || a.driver_id === hoverId) - Number(highlights.has(b.driver_id) || b.driver_id === hoverId))

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="block w-full" role="img" aria-label="Playoff seeds against the current standings">
      <text x={LEFT - 8} y={12} textAnchor="end" className="fill-faint text-[10px] font-semibold uppercase tracking-wider">
        Seed
      </text>
      <text x={RIGHT + 8} y={12} className="fill-faint text-[10px] font-semibold uppercase tracking-wider">
        Now
      </text>
      {order.map((d) => {
        const slot = highlights.get(d.driver_id)
        const active = slot != null || d.driver_id === hoverId
        const color = slot != null ? highlightColor(slot) : active ? 'var(--color-ink)' : 'var(--color-line-strong)'
        const out = s.races[race]?.playoff_round != null && !d.in_playoffs[race]
        const from = y(d.playoff_seed!)
        const to = y(rankOf.get(d.driver_id)!)
        const text = active ? 'fill-ink' : out ? 'fill-faint' : 'fill-muted'
        return (
          <g
            key={d.driver_id}
            onPointerEnter={() => onHover(d.driver_id)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onToggle(d.driver_id)}
            className="cursor-pointer"
          >
            <rect x={0} y={Math.min(from, to) - ROW / 2} width={W} height={Math.abs(to - from) + ROW} fill="transparent" />
            <text x={LEFT - 8} y={from} dy="0.32em" textAnchor="end" className={`text-[11px] ${text}`}>
              <tspan className="tabular fill-faint">{d.playoff_seed} </tspan>
              {surname(d.name)}
              <tspan className="tabular fill-faint"> {d.playoff_start_points?.toLocaleString()}</tspan>
            </text>
            <line x1={LEFT} x2={RIGHT} y1={from} y2={to} stroke={color} strokeWidth={active ? 2 : 1.25} strokeOpacity={out && !active ? 0.5 : 1} />
            <circle cx={LEFT} cy={from} r={2.5} fill={color} />
            <circle cx={RIGHT} cy={to} r={2.5} fill={color} />
            <text x={RIGHT + 8} y={to} dy="0.32em" className={`text-[11px] ${text}`}>
              {surname(d.name)}
              <tspan className="tabular fill-faint"> {d.points[race]?.toLocaleString()}</tspan>
            </text>
          </g>
        )
      })}
    </svg>
  )
}
