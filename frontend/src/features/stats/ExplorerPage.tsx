import { clsx } from 'clsx'
import { Search } from 'lucide-react'
import { useState } from 'react'

import { SeriesTabs } from '../../components/SeriesTabs'
import { useDocumentTitle } from '../../lib/brand'
import { DataNote } from './DataNote'
import { type Column, StatsTable } from './StatsTable'

interface Props<T> {
  title: string
  description: string
  /** Plural, lowercase: "drivers". */
  noun: string
  series: number
  onSeries: (series: number) => void
  /** The earliest season in the data, once loaded. */
  since: number | null | undefined
  /** Undefined while loading. */
  rows: T[] | undefined
  error: unknown
  /** Still showing the previous series' rows while the new ones load. */
  stale: boolean
  columns: Column<T>[]
  rowKey: (row: T) => string | number
  sortBy: string
  /** The text the filter box matches against. */
  searchText: (row: T) => string
}

/** A searchable, sortable list of everyone in a series, with the data-coverage note. */
export function ExplorerPage<T>(props: Props<T>) {
  const { title, description, noun, series, onSeries, since, rows: all, error, stale, columns, rowKey, sortBy, searchText } = props
  const [query, setQuery] = useState('')

  useDocumentTitle(title)

  const q = query.trim().toLowerCase()
  const rows = (all ?? []).filter((row) => !q || searchText(row).toLowerCase().includes(q))

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        <SeriesTabs value={series} onChange={onSeries} />
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-lg border border-line bg-panel px-3">
        <Search size={15} className="text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Filter ${noun}`}
          aria-label={`Filter ${noun}`}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {all && <span className="shrink-0 text-xs text-faint">{rows.length.toLocaleString()} {noun}</span>}
      </div>

      {since !== undefined && (
        <div className="mt-3">
          <DataNote series={series} since={since} />
        </div>
      )}

      {error ? (
        <p className="mt-10 text-center text-sm text-muted">Couldn&apos;t load the {noun}. ({String(error)})</p>
      ) : !all ? (
        <div className="mt-4 h-[32rem] animate-pulse rounded-xl bg-panel" />
      ) : (
        <div className={clsx('mt-4 rounded-xl border border-line bg-panel transition-opacity', stale && 'opacity-50')}>
          <StatsTable
            key={series}
            rows={rows}
            columns={columns}
            rowKey={rowKey}
            sortBy={sortBy}
            empty={q ? `No ${noun} match “${query.trim()}”.` : `No ${noun} in this series yet.`}
          />
        </div>
      )}
    </div>
  )
}
