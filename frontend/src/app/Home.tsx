import { useEffect } from 'react'
import { useNavigate } from 'react-router'

import { api, useSeasons } from '../api/client'
import { Problem } from '../features/replay/ReplayPage'

/** "/" opens the most recent Cup race that can be replayed. */
export function Home() {
  const navigate = useNavigate()
  const seasons = useSeasons()

  useEffect(() => {
    if (!seasons.data) return
    let live = true
    ;(async () => {
      for (const { year } of seasons.data) {
        const races = await api.races(year)
        const playable = races
          .filter((r) => r.has_lap_data && r.status !== 'scheduled')
          .sort((a, b) => (b.race_date ?? '').localeCompare(a.race_date ?? '') || a.series_id - b.series_id)
        const pick = playable.find((r) => r.series_id === 1) ?? playable[0]
        if (pick) {
          if (live) navigate(`/replay/${pick.race_id}`, { replace: true })
          return
        }
      }
      if (live) navigate('/races', { replace: true })
    })().catch(() => live && navigate('/races', { replace: true }))
    return () => {
      live = false
    }
  }, [seasons.data, navigate])

  if (seasons.error) return <Problem title="Couldn't reach the API" detail="Is the backend running on port 8000?" />
  return (
    <div className="grid flex-1 place-items-center text-sm text-muted">Finding the latest race…</div>
  )
}
