import { Flag, MapPin, Milestone, Rocket } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useDriver } from '../../api/client'
import type { DriverProfile } from '../../api/types'
import { useDocumentTitle } from '../../lib/brand'
import { cleanName } from '../../lib/format'
import { seriesName } from '../../lib/racing'
import { seasonColumns, teamColumns, trackColumns } from '../stats/columns'
import { ChampionshipInsight, CrashInsight, FastLapInsight, StartToFinishInsight } from '../stats/insights'
import { teamPath, trackPath } from '../stats/links'
import { bestByAvgFinish, minStartsFor, ordinal, percent, plural, seasonSpan } from '../stats/model'
import { ProfileFallback, ProfilePage } from '../stats/ProfilePage'
import { StatsTable } from '../stats/StatsTable'
import { Insight, InsightGrid, RecordTiles, Section } from '../stats/Tiles'
import { useSeriesParam } from '../stats/useSeriesParam'

/** One driver's record in a series: the numbers, what stands out, and season, track and team breakdowns. */
export function DriverPage() {
  const driverId = Number(useParams().driverId)
  const [series, setSeries] = useSeriesParam()
  const driver = useDriver(driverId, series)

  useDocumentTitle(driver.data ? cleanName(driver.data.name) : 'Driver')

  if (!driver.data) return <ProfileFallback error={driver.error} noun="driver" />
  const d = driver.data
  const latestTeam = d.teams.find((team) => d.seasons[0]?.teams.includes(team.name))
  return (
    <ProfilePage
      back={{ to: `/drivers?series=${d.series_id}`, label: 'Drivers' }}
      title={cleanName(d.name)}
      subtitle={
        <>
          {seriesName(d.series_id)}, {seasonSpan(d.first_season, d.last_season)}
          {latestTeam && (
            <>
              {' · '}
              <Link to={teamPath(latestTeam.slug, d.series_id)} className="hover:text-accent">
                {latestTeam.name}
              </Link>
            </>
          )}
        </>
      }
      series={d.series_id}
      seriesIds={d.series_ids}
      onSeries={setSeries}
      since={d.data_since}
    >
      <RecordTiles record={d.record} />
      <DriverInsights driver={d} />
      <Section title="Season by season" hint="The final championship position shows once a season is over.">
        <StatsTable rows={d.seasons} columns={seasonColumns(false)} rowKey={(s) => s.season} sortBy="season" />
      </Section>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Tracks" hint="Every track raced at, most wins first.">
          <StatsTable rows={d.tracks} columns={trackColumns(d.series_id)} rowKey={(t) => t.track_id} sortBy="wins" limit={10} />
        </Section>
        <Section title="Teams">
          <StatsTable rows={d.teams} columns={teamColumns(d.series_id)} rowKey={(t) => t.slug} sortBy="starts" />
        </Section>
      </div>
    </ProfilePage>
  )
}

function DriverInsights({ driver: d }: { driver: DriverProfile }) {
  const r = d.record
  const bestTrack = bestByAvgFinish(d.tracks, minStartsFor(d.tracks))
  return (
    <InsightGrid>
      <ChampionshipInsight championships={d.championships} best={d.best_championship} />
      <FastLapInsight lap={d.fastest_lap} showTrack />
      <CrashInsight record={r} />
      <StartToFinishInsight record={r} />
      <Insight
        icon={<Flag size={13} />}
        label="Out front"
        value={`Led ${plural(r.races_led, 'race')}`}
        detail={`${percent(r.races_led, r.starts)} of starts. ${plural(r.laps_led, 'lap')} led${r.laps_completed ? ` (${percent(r.laps_led, r.laps_completed)} of laps run)` : ''}.`}
      />
      <Insight
        icon={<Milestone size={13} />}
        label="Stage wins"
        value={d.stage_wins.toLocaleString()}
        detail={r.poles ? `${plural(r.poles, 'pole')}, ${r.pole_wins} turned into a win.` : 'No poles yet.'}
      />
      <Insight
        icon={<MapPin size={13} />}
        label="Best track"
        value={
          bestTrack ? (
            <Link to={trackPath(bestTrack.track_id, d.series_id)} className="hover:text-accent">
              {bestTrack.name}
            </Link>
          ) : (
            '–'
          )
        }
        detail={
          bestTrack &&
          `Averages ${bestTrack.record.avg_finish?.toFixed(1)} over ${plural(bestTrack.record.starts, 'start')}, ${plural(bestTrack.record.wins, 'win')}.`
        }
      />
      <Insight
        icon={<Rocket size={13} />}
        label="Win from furthest back"
        value={r.deepest_win_start != null ? `From ${ordinal(r.deepest_win_start)}` : '–'}
        detail={r.wins ? `${plural(r.wins, 'win')} in ${plural(r.starts, 'start')} (${percent(r.wins, r.starts)}).` : 'No wins yet.'}
      />
    </InsightGrid>
  )
}
