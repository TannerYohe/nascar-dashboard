import { create } from 'zustand'

export const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16, 32, 64] as const
export const DEFAULT_SPEED = 8

/**
 * The replay clock. Lives outside React state: it advances every animation
 * frame, and the track redraws from it directly. Panels read the throttled
 * `t` in the store instead.
 */
export const clock = {
  t: 0,
  listeners: new Set<(t: number) => void>(),
  subscribe(fn: (t: number) => void) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  },
  emit() {
    for (const fn of this.listeners) fn(this.t)
  },
}

export type FilterMode = 'hide' | 'dim'
export type SideTab = 'feed' | 'penalties' | 'pits'

interface ReplayState {
  duration: number
  playing: boolean
  speed: number
  /** Throttled copy of clock.t for React (about 8 updates a second). */
  t: number
  hidden: Set<number>
  filterMode: FilterMode
  selected: number | null
  hovered: number | null
  tab: SideTab

  reset: (duration: number, startAt?: number) => void
  play: () => void
  pause: () => void
  toggle: () => void
  seek: (t: number) => void
  setSpeed: (speed: number) => void
  faster: () => void
  slower: () => void
  setHidden: (hidden: Set<number>) => void
  toggleHidden: (driverId: number) => void
  setFilterMode: (mode: FilterMode) => void
  select: (driverId: number | null) => void
  hover: (driverId: number | null) => void
  setTab: (tab: SideTab) => void
}

export const useReplayStore = create<ReplayState>((set, get) => ({
  duration: 0,
  playing: false,
  speed: DEFAULT_SPEED,
  t: 0,
  hidden: new Set(),
  filterMode: 'hide',
  selected: null,
  hovered: null,
  tab: 'feed',

  reset: (duration, startAt = 0) => {
    clock.t = startAt
    set({ duration, t: startAt, playing: false, hidden: new Set(), selected: null, hovered: null })
    clock.emit()
  },
  play: () => {
    if (clock.t >= get().duration) get().seek(0)
    set({ playing: true })
  },
  pause: () => set({ playing: false }),
  toggle: () => (get().playing ? get().pause() : get().play()),
  seek: (t) => {
    clock.t = Math.max(-1, Math.min(get().duration, t))
    set({ t: clock.t })
    clock.emit()
  },
  setSpeed: (speed) => set({ speed }),
  faster: () => {
    const i = SPEEDS.indexOf(get().speed as (typeof SPEEDS)[number])
    set({ speed: SPEEDS[Math.min(SPEEDS.length - 1, i + 1)] })
  },
  slower: () => {
    const i = SPEEDS.indexOf(get().speed as (typeof SPEEDS)[number])
    set({ speed: SPEEDS[Math.max(0, i - 1)] })
  },
  setHidden: (hidden) => set({ hidden }),
  toggleHidden: (driverId) => {
    const hidden = new Set(get().hidden)
    if (hidden.has(driverId)) hidden.delete(driverId)
    else hidden.add(driverId)
    set({ hidden })
  },
  setFilterMode: (filterMode) => set({ filterMode }),
  select: (selected) => set({ selected: get().selected === selected ? null : selected }),
  hover: (hovered) => set({ hovered }),
  setTab: (tab) => set({ tab }),
}))

/** Drives the clock: one animation-frame loop for the whole replay. */
export function startClockLoop(): () => void {
  let raf = 0
  let last = performance.now()
  let lastUi = 0
  const loop = (now: number) => {
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    const s = useReplayStore.getState()
    if (s.playing) {
      clock.t = Math.min(s.duration, clock.t + dt * s.speed)
      if (clock.t >= s.duration) useReplayStore.setState({ playing: false })
      clock.emit()
      if (now - lastUi > 120) {
        useReplayStore.setState({ t: clock.t })
        lastUi = now
      }
    }
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}
