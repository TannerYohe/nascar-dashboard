import { FLAG, flagStyle } from '../../lib/racing'
import { clock } from '../../lib/format'
import type { RaceModel } from './engine/model'
import type { RaceState } from './engine/snapshot'

export function FlagPill({ flag }: { flag: number }) {
  const style = flagStyle(flag)
  const checkered = flag === FLAG.CHECKERED
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider"
      style={{ background: style.color, color: style.ink }}
    >
      {checkered ? (
        <span
          aria-hidden
          className="h-3 w-4 rounded-[2px]"
          style={{
            backgroundImage: 'repeating-conic-gradient(#111 0 25%, #fff 0 50%)',
            backgroundSize: '6px 6px',
          }}
        />
      ) : (
        <span aria-hidden className="h-2 w-2 rounded-full bg-current opacity-60" />
      )}
      {style.label}
    </span>
  )
}

export function RaceHeader({ model, state }: { model: RaceModel; state: RaceState }) {
  const stages = model.stageEnds.length
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <FlagPill flag={state.flag} />
      <Stat label="Lap">
        <span className="text-ink">{state.lap}</span>
        <span className="text-faint"> / {model.totalLaps || '–'}</span>
      </Stat>
      {stages > 0 && (
        <Stat label="Stage">
          {state.stage === stages ? 'Final' : `${state.stage} of ${stages}`}
        </Stat>
      )}
      <Stat label="To go">{state.lapsToGo}</Stat>
      <Stat label="Race time">{clock(state.t)}</Stat>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wider text-faint">{label}</span>
      <span className="tabular font-mono text-sm font-semibold">{children}</span>
    </div>
  )
}
