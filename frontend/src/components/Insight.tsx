import { clsx } from 'clsx'

interface Props {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  /** Tighter padding and a one-line detail, for rows of summary tiles. */
  compact?: boolean
}

/** A labelled headline value with a line of context. */
export function Insight({ icon, label, value, detail, compact }: Props) {
  return (
    <div className={clsx('min-w-0 rounded-xl border border-line bg-panel', compact ? 'p-3 sm:p-4' : 'p-4')}>
      <div className="flex items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-wider text-faint">
        {icon}
        {label}
      </div>
      <div className={clsx('mt-2 truncate font-bold tracking-tight', compact ? 'sm:text-lg' : 'text-xl')}>{value}</div>
      {detail && <div className={clsx('mt-0.5 text-xs text-muted', compact ? 'truncate' : 'leading-relaxed')}>{detail}</div>}
    </div>
  )
}
