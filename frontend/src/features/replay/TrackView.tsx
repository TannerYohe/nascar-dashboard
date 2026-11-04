import { useEffect, useMemo, useRef, useState } from 'react'

import { makeHex } from '../../lib/racing'
import { cleanName } from '../../lib/format'
import type { RaceModel } from './engine/model'
import { frameAt } from './engine/snapshot'
import { clock, useReplayStore } from './store'
import { buildGeometry, loadLayout, pitPoint, pointOn, type TrackGeometry } from './track'

interface Props {
  model: RaceModel
}

export function TrackView({ model }: Props) {
  const [geometry, setGeometry] = useState<TrackGeometry | null>(null)

  useEffect(() => {
    let live = true
    loadLayout(model.race.track_id, model.race.track_length_mi).then(
      (layout) => live && setGeometry(buildGeometry(layout)),
    )
    return () => {
      live = false
    }
  }, [model.race.track_id, model.race.track_length_mi])

  if (!geometry) return <div className="h-full w-full animate-pulse rounded-xl bg-panel" />
  return <Track model={model} geometry={geometry} />
}

function Track({ model, geometry }: { model: RaceModel; geometry: TrackGeometry }) {
  const { layout, size } = geometry
  const [minX, minY, w, h] = layout.viewBox
  const pad = size * 0.06
  const r = size * 0.021
  const carRefs = useRef(new Map<number, SVGGElement>())
  const hidden = useReplayStore((s) => s.hidden)
  const filterMode = useReplayStore((s) => s.filterMode)
  const selected = useReplayStore((s) => s.selected)
  const hovered = useReplayStore((s) => s.hovered)
  const hover = useReplayStore((s) => s.hover)
  const select = useReplayStore((s) => s.select)

  const sf = useMemo(() => {
    const a = pointOn(geometry.main, 0, size * 0.035)
    const b = pointOn(geometry.main, 0, -size * 0.035)
    return { a, b }
  }, [geometry, size])

  const pitLane = useMemo(() => {
    if (layout.pit) return layout.pit
    const pts = Array.from({ length: 40 }, (_, i) => pitPoint(geometry, i / 39))
    return `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')}`
  }, [geometry, layout.pit])

  // Draw every frame straight onto the car elements, bypassing React.
  useEffect(() => {
    const draw = (t: number) => {
      const s = useReplayStore.getState()
      for (const car of model.cars) {
        const el = carRefs.current.get(car.driverId)
        if (!el) continue
        const f = frameAt(car, t, model.finishTime)
        const isHidden = s.hidden.has(car.driverId)
        if ((isHidden && s.filterMode === 'hide') || f.status === 'out' || car.lastLap === 0) {
          el.style.display = 'none'
          continue
        }
        el.style.display = ''
        let p
        if (f.status === 'pit') p = pitPoint(geometry, f.pitFraction)
        else if (f.status === 'grid')
          p = pointOn(geometry.main, f.progress, (car.gridLane ? -1 : 1) * r * 0.9)
        else p = pointOn(geometry.main, f.lapFraction)
        el.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`)
        const dim = (isHidden && s.filterMode === 'dim') || f.status === 'finished'
        el.style.opacity = dim ? '0.28' : '1'
      }
    }
    draw(clock.t)
    return clock.subscribe(draw)
  }, [model, geometry, r])

  // Re-run a frame when filters change while paused.
  useEffect(() => clock.emit(), [hidden, filterMode])

  // Selected and hovered cars draw last, on top of the pack.
  const order = useMemo(() => {
    const top = [hovered, selected].filter((x) => x != null)
    return [...model.cars].sort((a, b) => top.indexOf(a.driverId) - top.indexOf(b.driverId))
  }, [model.cars, selected, hovered])

  const hoveredCar = hovered != null ? model.byDriver.get(hovered) : undefined

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`${minX - pad} ${minY - pad} ${w + pad * 2} ${h + pad * 2}`}
        className="h-full w-full select-none"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${model.race.track_name ?? 'Track'} map with car positions`}
      >
        {/* Track surface: a wide dark band with a faint edge line. */}
        <path d={layout.path} fill="none" stroke="#2a303a" strokeWidth={size * 0.062} strokeLinejoin="round" />
        <path d={layout.path} fill="none" stroke="#161a20" strokeWidth={size * 0.052} strokeLinejoin="round" />
        <path
          d={pitLane}
          fill="none"
          stroke="#2a303a"
          strokeWidth={size * 0.012}
          strokeDasharray={`${size * 0.012} ${size * 0.01}`}
          strokeLinecap="round"
        />
        <line
          x1={sf.a.x}
          y1={sf.a.y}
          x2={sf.b.x}
          y2={sf.b.y}
          stroke="#f4f4f5"
          strokeWidth={size * 0.006}
          strokeDasharray={`${size * 0.006} ${size * 0.006}`}
        />

        {order.map((car) => {
          const { fill, ink } = makeHex(car.make)
          const isSel = selected === car.driverId
          const isHover = hovered === car.driverId
          return (
            <g
              key={car.driverId}
              ref={(el) => {
                if (el) carRefs.current.set(car.driverId, el)
                else carRefs.current.delete(car.driverId)
              }}
              className="cursor-pointer"
              style={{ transition: 'opacity 200ms' }}
              onPointerEnter={() => hover(car.driverId)}
              onPointerLeave={() => hover(null)}
              onClick={() => select(car.driverId)}
            >
              {(isSel || isHover) && (
                <circle r={r * 1.55} fill="none" stroke="#fff" strokeWidth={r * 0.22} opacity={isSel ? 1 : 0.6} />
              )}
              <circle r={r} fill={fill} stroke="#0a0c0f" strokeWidth={r * 0.14} />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={car.label.length > 2 ? r * 0.85 : r * 1.05}
                fontWeight={700}
                fill={ink}
                fontFamily="Inter, sans-serif"
                pointerEvents="none"
              >
                {car.label}
              </text>
            </g>
          )
        })}
      </svg>

      {hoveredCar && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border border-line bg-raised/95 px-3 py-2 text-sm shadow-xl">
          <div className="font-semibold">
            #{hoveredCar.label} {cleanName(hoveredCar.name)}
          </div>
          <div className="text-xs text-muted">{[hoveredCar.make, hoveredCar.team].filter(Boolean).join(' · ')}</div>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] text-faint">
        {layout.generated ? 'Generic layout · no map for this track yet' : `Track map ${layout.source ?? ''}`}
      </div>
    </div>
  )
}
