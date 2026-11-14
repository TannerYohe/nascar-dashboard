import { Factory, Flag, Rocket, Users } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { useTeam } from '../../api/client'
import type { TeamProfile } from '../../api/types'
import { useDocumentTitle } from '../../lib/brand'
import { cleanName } from '../../lib/format'
import { seriesName } from '../../lib/racing'
import { driverColumns, seasonColumns } from '../stats/columns'
import { ChampionshipInsight, CrashInsight, FastLapInsight, StartToFinishInsight } from '../stats/insights'
import { driverPath } from '../stats/links'
import { ordinal, percent, plural, seasonSpan } from '../stats/model'
import { ProfileFallback, ProfilePage } from '../stats/ProfilePage'
import { StatsTable } from '../stats/StatsTable'
import { Insight, InsightGrid, RecordTiles, Section } from '../stats/Tiles'
import { useSeriesParam } from '../stats/useSeriesParam'

/** One team's record in a series across all its cars, with its drivers and seasons. */
export function TeamPage() {
  const slug = useParams().slug ?? ''
  const [series, setSeries] = useSeriesParam()
  const team = useTeam(slug, series)

  useDocumentTitle(team.data?.name ?? 'Team')

  if (!team.data) return <ProfileFallback error={team.error} noun="team" />
  const t = team.data
  const otherNames = [...new Set(t.seasons.flatMap((s) => s.teams))].filter((name) => name !== t.name)
  return (
    <ProfilePage
      back={{ to: `/teams?series=${t.series_id}`, label: 'Teams' }}
      title={t.name}
      subtitle={
        <>
          {seriesName(t.series_id)}, {seasonSpan(t.first_season, t.last_season)}
          {otherNames.length > 0 && ` · also listed as ${otherNames.join(', ')}`}
        </>
      }
      series={t.series_id}
      seriesIds={t.series_ids}
      onSeries={setSeries}
      since={t.data_since}
    >
      <RecordTiles record={t.record} />
      <TeamInsights team={t} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title="Drivers" hint="Everyone who has driven for the team, most wins first.">
          <StatsTable rows={t.drivers} columns={driverColumns(t.series_id)} rowKey={(d) => d.driver_id} sortBy="wins" limit={12} />
        </Section>
        <Section title="Season by season" hint="Pts pos is the team's best driver in the final standings.">
          <StatsTable rows={t.seasons} columns={seasonColumns(true).filter((c) => c.id !== 'teams')} rowKey={(s) => s.season} sortBy="season" />
        </Section>
      </div>
    </ProfilePage>
  )
}

function TeamInsights({ team: t }: { team: TeamProfile }) {
  const r = t.record
  const top = t.drivers[0]
  const [make] = t.makes
  return (
    <InsightGrid>
      <ChampionshipInsight championships={t.championships} best={t.best_championship} showDriver />
      <FastLapInsight lap={t.fastest_lap} showDriver showTrack />
      <CrashInsight record={r} />
      <Insight
        icon={<Flag size={13} />}
        label="Win rate"
        value={percent(r.wins, r.starts)}
        detail={`${plural(r.wins, 'win')} from ${plural(r.starts, 'start')}. Led laps in ${percent(r.races_led, r.starts)} of them.`}
      />
      <Insight
        icon={<Users size={13} />}
        label="Top driver"
        value={
          top ? (
            <Link to={driverPath(top.driver_id, t.series_id)} className="hover:text-accent">
              {cleanName(top.name)}
            </Link>
          ) : (
            '–'
          )
        }
        detail={top && `${plural(top.record.wins, 'win')} in ${plural(top.record.starts, 'start')}. ${plural(t.drivers.length, 'driver')} in all.`}
      />
      <Insight
        icon={<Factory size={13} />}
        label="Manufacturer"
        value={make?.make ?? '–'}
        detail={t.makes.map((m) => `${m.make} ${plural(m.starts, 'start')}`).join(', ') || undefined}
      />
      <Insight
        icon={<Rocket size={13} />}
        label="Win from furthest back"
        value={r.deepest_win_start != null ? `From ${ordinal(r.deepest_win_start)}` : '–'}
        detail={r.poles ? `${plural(r.poles, 'pole')}, ${r.pole_wins} turned into a win.` : 'No poles yet.'}
      />
      <StartToFinishInsight record={r} />
    </InsightGrid>
  )
}
