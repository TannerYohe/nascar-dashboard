import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router'

import { useRaces } from '../../api/client'
import { shortDate } from '../../lib/format'
import { seriesName } from '../../lib/racing'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** Ctrl/⌘-K search across every race, e.g. "daytona 2024" or "cup martinsville". */
export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const races = useRaces({ enabled: open })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const items = useMemo(
    () =>
      [...(races.data ?? [])]
        .filter((r) => r.status !== 'scheduled')
        .sort((a, b) => (b.race_date ?? '').localeCompare(a.race_date ?? '')),
    [races.data],
  )

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Search races"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl shadow-black/70"
      filter={(value, search) => {
        // Every word typed has to appear somewhere: "2024 daytona cup".
        const v = value.toLowerCase()
        return search.toLowerCase().split(/\s+/).every((w) => v.includes(w)) ? 1 : 0
      }}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={16} className="text-faint" />
        <Command.Input
          placeholder="Search races: try “daytona 2024” or “truck bristol”"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-faint">Esc</kbd>
      </div>
      <Command.List className="max-h-[55vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-sm text-faint">
          {races.isLoading ? 'Loading races…' : 'No races match.'}
        </Command.Empty>
        {items.map((r) => (
          <Command.Item
            key={r.race_id}
            value={`${r.race_id} ${r.season} ${seriesName(r.series_id)} ${r.race_name} ${r.track_name} ${r.winner?.name ?? ''}`}
            onSelect={() => {
              onOpenChange(false)
              navigate(`/replay/${r.race_id}`)
            }}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm data-[selected=true]:bg-raised"
          >
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-faint">
              {r.season} {seriesName(r.series_id, true)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.race_name}</span>
              <span className="block truncate text-[11px] text-faint">{r.track_name}</span>
            </span>
            <span className="shrink-0 text-[11px] text-faint">
              {r.has_lap_data ? shortDate(r.race_date) : 'No lap data'}
            </span>
          </Command.Item>
        ))}
      </Command.List>
    </Command.Dialog>
  )
}
