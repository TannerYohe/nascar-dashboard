import { ArrowLeftRight, Crown, Rocket, Ruler, TriangleAlert, Zap } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useTrack } from '../../api/client'
import type { TrackProfile } from '../../api/types'
import { useDocumentTitle } from '../../lib/brand'
import { cleanName } from '../../lib/format'
import { seriesName } from '../../lib/racing'
import { RaceCard } from '../picker/RaceList'
import { driverColumns, teamColumns } from '../stats/columns'
import { CrashInsight, FastLapInsight } from '../stats/insights'
import { driverPath, replayPath } from '../stats/links'
import { ordinal, percent, plural, seasonSpan } from '../stats/model'
import { ProfileFallback, ProfilePage } from '../stats/ProfilePage'
import { StatsTable } from '../stats/StatsTable'
import { Insight, InsightGrid, Section } from '../stats/Tiles'
import { useSeriesParam } from '../stats/useSeriesParam'

/** One track in a series: how its races tend to go, who wins there, and every race held. */
export function TrackPage() {
  const trackId = Number(useParams().trackId)
  const [series, setSeries] = useSeriesParam()
  const track = useTrack(trackId, series)

  useDocumentTitle(track.data?.name ?? 'Track')

  if (!track.data) return <ProfileFallback error={track.error} noun="track" />
  const t = track.data
  return (
    <ProfilePage
      back={{ to: `/tracks?series=${t.series_id}`, label: 'Tracks' }}
      title={t.name ?? `Track ${t.track_id}`}
      subtitle={`${seriesName(t.series_id)}, ${plural(t.races, 'race')} from ${seasonSpan(t.first_season, t.last_season)}`}
      series={t.series_id}
      seriesIds={t.series_ids}
      onSeries={setSeries}
      since={t.data_since}
    >
      <TrackInsights track={t} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Drivers" hint="Everyone's record here, most wins first.">
          <StatsTable rows={t.drivers} columns={driverColumns(t.series_id)} rowKey={(d) => d.driver_id} sortBy="wins" limit={12} />
        </Section>
        <Section title="Teams">
          <StatsTable rows={t.teams} columns={teamColumns(t.series_id)} rowKey={(team) => team.slug} sortBy="wins" limit={12} />
        </Section>
      </div>
      <section>
        <h2 className="mb-3 font-semibold">Races</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.race_list.map((race) => (
            <RaceCard key={race.race_id} race={race} />
          ))}
        </div>
      </section>
    </ProfilePage>
  )
}

function TrackInsights({ track: t }: { track: TrackProfile }) {
  const r = t.record
  const winners = t.drivers.filter((d) => d.record.wins > 0)
  const king = winners[0]
  return (
    <InsightGrid>
      <Insight
        icon={<Ruler size={13} />}
        label="Length"
        value={t.length_mi ? `${t.length_mi.toFixed(3)} mi` : '–'}
        detail={`${plural(t.races, 'race')}, ${plural(winners.length, 'different winner')}.`}
      />
      <Insight
        icon={<Crown size={13} />}
        label="Most wins"
        value={
          king ? (
            <Link to={driverPath(king.driver_id, t.series_id)} className="hover:text-accent">
              {cleanName(king.name)}
            </Link>
          ) : (
            '–'
          )
        }
        detail={king && `${plural(king.record.wins, 'win')} in ${plural(king.record.starts, 'start')}.`}
      />
      <Insight
        icon={<TriangleAlert size={13} />}
        label="Cautions"
        value={t.avg_cautions != null ? `${t.avg_cautions} a race` : '–'}
        detail={t.avg_caution_laps != null ? `${t.avg_caution_laps} laps under yellow on average.` : undefined}
      />
      <Insight
        icon={<ArrowLeftRight size={13} />}
        label="Lead changes"
        value={t.avg_lead_changes != null ? `${t.avg_lead_changes} a race` : '–'}
        detail={t.avg_leaders != null ? `${t.avg_leaders} different leaders on average.` : undefined}
      />
      <FastLapInsight lap={t.fastest_lap} showDriver />
      <Insight
        icon={<Zap size={13} />}
        label="Fastest race"
        value={t.fastest_race ? `${t.fastest_race.average_speed.toFixed(1)} mph` : '–'}
        detail={
          t.fastest_race && (
            <Link to={replayPath(t.fastest_race.race_id)} className="hover:text-accent hover:underline">
              {t.fastest_race.season} {t.fastest_race.race_name}
            </Link>
          )
        }
      />
      <CrashInsight record={r} />
      <Insight
        icon={<Rocket size={13} />}
        label="Starting spot"
        value={`${percent(r.pole_wins, t.races)} from pole`}
        detail={r.deepest_win_start != null ? `The deepest winning start is ${ordinal(r.deepest_win_start)}.` : undefined}
      />
    </InsightGrid>
  )
}
