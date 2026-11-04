import * as Popover from '@radix-ui/react-popover'
import { clsx } from 'clsx'
import { Check, ListFilter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'

import { cleanName } from '../../lib/format'
import { MAKES, makeColor } from '../../lib/racing'
import { CarChip } from './Leaderboard'
import type { RaceModel } from './engine/model'
import type { StandingRow } from './engine/snapshot'
import { useReplayStore } from './store'

interface Props {
  model: RaceModel
  rows: StandingRow[]
}

export function CarFilter({ model, rows }: Props) {
  const hidden = useReplayStore((s) => s.hidden)
  const filterMode = useReplayStore((s) => s.filterMode)
  const { setHidden, toggleHidden, setFilterMode } = useReplayStore.getState()
  const [query, setQuery] = useState('')

  const all = model.cars
  const shownCount = all.length - hidden.size
  const onlyThese = (ids: number[]) => setHidden(new Set(all.map((c) => c.driverId).filter((id) => !ids.includes(id))))

  const teams = useMemo(() => {
    const byTeam = new Map<string, number[]>()
    for (const c of all) {
      if (!c.team) continue
      byTeam.set(c.team, [...(byTeam.get(c.team) ?? []), c.driverId])
    }
    return [...byTeam.entries()].filter(([, ids]) => ids.length > 1).sort((a, b) => b[1].length - a[1].length)
  }, [all])

  const q = query.trim().toLowerCase()
  const list = all
    .filter((c) => !q || c.label.includes(q) || c.name.toLowerCase().includes(q) || c.team?.toLowerCase().includes(q))
    .sort((a, b) => (a.car ?? 999) - (b.car ?? 999))

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={clsx(
            'inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
            hidden.size
              ? 'border-accent/50 bg-accent/10 text-accent'
              : 'border-line bg-panel text-muted hover:border-line-strong hover:text-ink',
          )}
        >
          <ListFilter size={14} />
          {hidden.size ? `${shownCount} of ${all.length} cars` : 'All cars'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          className="z-50 flex max-h-[70vh] w-[22rem] flex-col rounded-xl border border-line bg-panel shadow-2xl shadow-black/60"
        >
          <div className="space-y-3 border-b border-line p-3">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-bg px-2.5">
              <Search size={14} className="text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Car number, driver or team"
                className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
                autoFocus
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip onClick={() => setHidden(new Set())} active={hidden.size === 0}>
                All
              </Chip>
              <Chip onClick={() => onlyThese(rows.slice(0, 10).map((r) => r.frame.car.driverId))}>Top 10 now</Chip>
              {MAKES.map((make) => (
                <Chip key={make} onClick={() => onlyThese(all.filter((c) => c.make === make).map((c) => c.driverId))}>
                  <span className="h-2 w-2 rounded-full" style={{ background: makeColor(make) }} />
                  {make}
                </Chip>
              ))}
              <Chip onClick={() => setHidden(new Set(all.map((c) => c.driverId)))}>None</Chip>
            </div>
            {teams.length > 0 && (
              <select
                className="h-8 w-full rounded-lg border border-line bg-bg px-2 text-xs text-muted outline-none"
                value=""
                onChange={(e) => {
                  const team = teams.find(([name]) => name === e.target.value)
                  if (team) onlyThese(team[1])
                }}
                aria-label="Show one team"
              >
                <option value="">Show one team…</option>
                {teams.map(([name, ids]) => (
                  <option key={name} value={name}>
                    {name} ({ids.length})
                  </option>
                ))}
              </select>
            )}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto py-1">
            {list.map((c) => {
              const on = !hidden.has(c.driverId)
              return (
                <li key={c.driverId}>
                  <button
                    type="button"
                    onClick={() => toggleHidden(c.driverId)}
                    className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition hover:bg-raised"
                  >
                    <span
                      className={clsx(
                        'grid h-4 w-4 place-items-center rounded border',
                        on ? 'border-ink bg-ink text-bg' : 'border-line-strong',
                      )}
                    >
                      {on && <Check size={11} strokeWidth={3} />}
                    </span>
                    <CarChip label={c.label} make={c.make} small />
                    <span className={clsx('truncate', !on && 'text-faint')}>{cleanName(c.name)}</span>
                    <span className="ml-auto truncate text-[11px] text-faint">{c.team}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-muted">
            <span>Filtered cars are</span>
            <div className="flex rounded-md border border-line p-0.5">
              {(['hide', 'dim'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setFilterMode(m)}
                  className={clsx(
                    'rounded px-2 py-0.5 capitalize transition',
                    filterMode === m ? 'bg-raised text-ink' : 'text-faint hover:text-muted',
                  )}
                >
                  {m === 'hide' ? 'Hidden' : 'Dimmed'}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Chip({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition',
        active ? 'border-ink/60 bg-raised text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink',
      )}
    >
      {children}
    </button>
  )
}
