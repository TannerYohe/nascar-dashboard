import { clsx } from 'clsx'

import { SERIES } from '../lib/racing'

interface Props {
  value: number
  onChange: (series: number) => void
  /** Series that can be picked; every series when undefined. */
  available?: ReadonlySet<number>
}

/** Cup / Xfinity / Truck tabs. */
export function SeriesTabs({ value, onChange, available }: Props) {
  return (
    <div className="flex rounded-lg border border-line bg-panel p-0.5" role="tablist" aria-label="Series">
      {SERIES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={s.id === value}
          onClick={() => onChange(s.id)}
          disabled={available != null && !available.has(s.id)}
          className={clsx(
            'rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:opacity-30',
            s.id === value ? 'bg-raised text-ink shadow' : 'text-faint hover:text-muted',
          )}
        >
          {s.short}
        </button>
      ))}
    </div>
  )
}
