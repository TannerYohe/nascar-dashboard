import type { StatRecord } from '../../api/types'

/** The headline numbers of a record, in one row of compact tiles. */
export function RecordTiles({ record }: { record: StatRecord }) {
  const tiles: [string, string][] = [
    ['Starts', record.starts.toLocaleString()],
    ['Wins', record.wins.toLocaleString()],
    ['Podiums', record.podiums.toLocaleString()],
    ['Top 5s', record.top_5.toLocaleString()],
    ['Top 10s', record.top_10.toLocaleString()],
    ['Poles', record.poles.toLocaleString()],
    ['Laps led', record.laps_led.toLocaleString()],
    ['Avg fin', record.avg_finish?.toFixed(1) ?? '–'],
  ]
  return (
    <dl className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-8">
      {tiles.map(([label, value]) => (
        <div key={label} className="min-w-0 bg-panel px-3 py-3">
          <dt className="truncate text-[10px] font-semibold uppercase tracking-wider text-faint sm:text-[11px]">{label}</dt>
          <dd className="tabular mt-1 truncate text-lg font-bold tracking-tight sm:text-2xl">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function InsightGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
}

/** A titled panel. */
export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  )
}
