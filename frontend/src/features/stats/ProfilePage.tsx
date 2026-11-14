import { ChevronLeft } from 'lucide-react'
import { Link } from 'react-router'

import { ApiError } from '../../api/client'
import { Problem } from '../../components/Problem'
import { SeriesTabs } from '../../components/SeriesTabs'
import { DataNote } from './DataNote'

interface Props {
  back: { to: string; label: string }
  title: string
  subtitle: React.ReactNode
  series: number
  seriesIds: number[]
  onSeries: (series: number) => void
  since: number | null
  children: React.ReactNode
}

/** The frame of a driver, team or track page: a way back, the name, series tabs and the data-coverage note. */
export function ProfilePage({ back, title, subtitle, series, seriesIds, onSeries, since, children }: Props) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link to={back.to} className="inline-flex items-center gap-1 text-xs font-semibold text-faint transition hover:text-muted">
        <ChevronLeft size={14} />
        {back.label}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{subtitle}</p>
        </div>
        <SeriesTabs value={series} onChange={onSeries} available={new Set(seriesIds)} />
      </div>
      <div className="mt-4">
        <DataNote series={series} since={since} />
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

/** What to show while a profile loads, or when it fails. */
export function ProfileFallback({ error, noun }: { error: unknown; noun: string }) {
  if (error instanceof ApiError && error.status === 404) {
    return <Problem title={`No ${noun} here`} detail={`There are no points-race results for this ${noun} in that series.`} />
  }
  if (error) return <Problem title={`Couldn't load this ${noun}`} detail={String(error)} />
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8" aria-busy>
      <div className="h-16 w-72 animate-pulse rounded-lg bg-panel" />
      <div className="h-20 animate-pulse rounded-xl bg-panel" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-panel" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-panel" />
    </div>
  )
}
