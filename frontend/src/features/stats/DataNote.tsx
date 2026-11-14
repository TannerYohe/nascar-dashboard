import { Info } from 'lucide-react'

import { seriesName } from '../../lib/racing'

/** Says how far back the stats go, since anything before the earliest season in the data is missing. */
export function DataNote({ series, since }: { series: number; since: number | null }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line bg-panel/60 px-3 py-2 text-xs leading-relaxed text-muted">
      <Info size={14} className="mt-0.5 shrink-0 text-faint" />
      <span>
        {since != null ? (
          <>
            Stats only cover {seriesName(series)} races from <strong className="font-semibold text-ink">{since}</strong> on, the
            earliest season NasDash has data for. Earlier races, including the start of longer careers, aren&apos;t counted.
          </>
        ) : (
          <>NasDash has no {seriesName(series)} results yet.</>
        )}{' '}
        Points races only: exhibitions like the Clash and the All-Star Race are left out.
      </span>
    </p>
  )
}
