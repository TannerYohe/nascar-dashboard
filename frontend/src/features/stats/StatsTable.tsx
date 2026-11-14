import { clsx } from 'clsx'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'


export interface Column<T> {
  id: string
  label: string
  /** Header tooltip. */
  title?: string
  /** What the column sorts by. */
  value: (row: T) => number | string | null
  render?: (row: T) => React.ReactNode
  /** Text columns sit left; numbers right. */
  text?: boolean
  /** Sorts low to high first (average finish), rather than high to low. */
  ascending?: boolean
  /** Only shown from this breakpoint up. */
  from?: 'sm' | 'md' | 'lg'
}

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  sortBy: string
  /** Rows shown before "Show all". */
  limit?: number
  empty?: string
}

const FROM = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

/** A table that sorts by any column when its header is clicked. Missing values always sort last. */
export function StatsTable<T>({ rows, columns, rowKey, sortBy, limit, empty = 'Nothing to show.' }: Props<T>) {
  const initial = columns.find((c) => c.id === sortBy) ?? columns[0]
  const [sort, setSort] = useState({ id: initial.id, ascending: initial.ascending ?? false })
  const [expanded, setExpanded] = useState(false)
  const column = columns.find((c) => c.id === sort.id) ?? initial

  const sorted = [...rows].sort((a, b) => compare(column.value(a), column.value(b), sort.ascending))
  const shown = limit && !expanded ? sorted.slice(0, limit) : sorted

  const onSort = (c: Column<T>) =>
    setSort((s) => (s.id === c.id ? { id: c.id, ascending: !s.ascending } : { id: c.id, ascending: c.ascending ?? !!c.text }))

  if (rows.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted">{empty}</p>
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] font-semibold uppercase tracking-wider text-faint">
              {columns.map((c) => (
                <th
                  key={c.id}
                  title={c.title}
                  aria-sort={c.id === sort.id ? (sort.ascending ? 'ascending' : 'descending') : undefined}
                  className={clsx('whitespace-nowrap px-2 py-2 first:pl-4 last:pr-4', c.text ? 'text-left' : 'text-right', c.from && FROM[c.from])}
                >
                  <button
                    type="button"
                    onClick={() => onSort(c)}
                    className={clsx('inline-flex items-center gap-1 uppercase tracking-wider transition hover:text-muted', c.id === sort.id && 'text-ink')}
                  >
                    {c.label}
                    {c.id === sort.id && (sort.ascending ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className="border-b border-line/60 transition last:border-0 hover:bg-raised/60">
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={clsx(
                      'px-2 py-2 first:pl-4 last:pr-4',
                      c.text ? 'max-w-[16rem] truncate text-left' : 'tabular whitespace-nowrap text-right',
                      c.from && FROM[c.from],
                    )}
                  >
                    {c.render ? c.render(row) : (c.value(row) ?? '–')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {limit != null && rows.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full border-t border-line py-2 text-xs font-semibold text-accent transition hover:bg-raised"
        >
          {expanded ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}

function compare(a: number | string | null, b: number | string | null, ascending: boolean): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  const order = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b)
  return ascending ? order : -order
}
