import { clsx } from 'clsx'

import { makeStyle } from '../../lib/racing'

/** A car number on its manufacturer's color. */
export function CarChip({ label, make, small }: { label: string; make: string | null; small?: boolean }) {
  const { fill, ink } = makeStyle(make)
  return (
    <span
      className={clsx(
        'tabular inline-grid shrink-0 place-items-center rounded font-mono font-bold',
        small ? 'h-5 min-w-6 px-1 text-[11px]' : 'h-6 min-w-8 px-1 text-xs',
      )}
      style={{ background: fill, color: ink }}
    >
      {label}
    </span>
  )
}
