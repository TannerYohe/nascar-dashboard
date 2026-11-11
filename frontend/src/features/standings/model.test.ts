import { describe, expect, it } from 'vitest'

import type { DriverSeason, PlayoffFormat, RaceSummary, SeasonStandings } from '../../api/types'
import {
  chartDrivers,
  chartValue,
  defaultHighlights,
  divider,
  formatSummary,
  formatValue,
  niceTicks,
  phases,
  positionChange,
  spreadLabels,
  standingsAt,
  status,
  toggleHighlight,
} from './model'

function race(i: number, playoffRound: number | null): RaceSummary {
  return {
    race_id: 100 + i,
    series_id: 1,
    season: 2030,
    race_name: `Race ${i + 1}`,
    track_id: null,
    track_name: null,
    race_date: null,
    round: i + 1,
    is_exhibition: false,
    playoff_round: playoffRound,
    scheduled_laps: null,
    actual_laps: null,
    winner: null,
    has_lap_data: false,
    status: 'finished',
  }
}

function driver(id: number, positions: (number | null)[], inPlayoffs: (boolean | null)[], seed: number | null = null): DriverSeason {
  return {
    driver_id: id,
    name: `Driver ${id}`,
    car_number: id,
    is_rookie: false,
    positions,
    points: positions.map((p) => (p == null ? null : 100 - p)),
    earned: positions.map(() => 10),
    gap_to_leader: positions.map((p) => (p == null ? null : 1 - p)),
    wins: positions.map(() => 0),
    top_5: positions.map(() => 0),
    top_10: positions.map(() => 0),
    in_playoffs: inPlayoffs,
    playoff_seed: seed,
    playoff_start_points: seed == null ? null : 2100 - 25 * (seed - 1),
  }
}

// Two regular-season races, then playoff races; three drivers, two make the playoffs.
function season(format: PlayoffFormat, rounds: (number | null)[], drivers: DriverSeason[]): SeasonStandings {
  return {
    season: 2030,
    series_id: 1,
    format,
    playoff_field: 2,
    races: rounds.map((r, i) => race(i, r)),
    standings_through: rounds.length,
    drivers,
    regular_season_champion_id: 1,
    champion_id: 2,
  }
}

const chase = season(
  'chase',
  [null, null, 1, 1],
  [
    driver(2, [2, 2, 2, 1], [false, false, true, true], 2),
    driver(1, [1, 1, 1, 2], [false, false, true, true], 1),
    driver(3, [3, 3, 3, 3], [false, false, false, false]),
  ],
)

// A round of two, then a final of one.
const elimination = season(
  'elimination',
  [null, 1, 2],
  [
    driver(1, [1, 1, 2], [false, true, false], 1),
    driver(2, [2, 2, 1], [false, true, true], 2),
    driver(3, [3, 3, 3], [false, false, false]),
  ],
)

describe('phases', () => {
  it('splits the Chase from the regular season', () => {
    expect(phases(chase).map((p) => [p.label, p.start, p.end])).toEqual([
      ['Regular season', 0, 1],
      ['The Chase', 2, 3],
    ])
  })

  it('names elimination rounds by the field still in them', () => {
    expect(phases(elimination).map((p) => p.label)).toEqual(['Regular season', 'Round of 2', 'Round of 1'])
  })
})

describe('chartValue', () => {
  it('drops the gap for drivers out of the playoffs once they start', () => {
    const outside = chase.drivers[2]
    expect(chartValue(chase, outside, 1, 'gap')).toBe(-2)
    expect(chartValue(chase, outside, 2, 'gap')).toBeNull()
    expect(chartValue(chase, outside, 2, 'position')).toBe(3)
  })
})

describe('standings', () => {
  it('orders drivers by position after the chosen race', () => {
    expect(standingsAt(chase, 3).map((d) => d.driver_id)).toEqual([2, 1, 3])
  })

  it('reports places gained and lost', () => {
    expect(positionChange(chase.drivers[0], 3)).toBe(1)
    expect(positionChange(chase.drivers[1], 3)).toBe(-1)
    expect(positionChange(chase.drivers[0], 0)).toBeNull()
  })

  it('draws the Chase cutline, the cut to the next elimination round, and nothing before eliminations', () => {
    expect(divider(chase, 1)).toEqual({ after: 2, label: 'Chase cutline' })
    expect(divider(chase, 2)).toEqual({ after: 2, label: 'Chase field' })
    expect(divider(elimination, 0)).toBeNull()
    expect(divider(elimination, 1)).toEqual({ after: 1, label: 'Top 1 advance' })
    expect(divider(elimination, 2)).toEqual({ after: 1, label: 'Round of 1' })
  })

  it('marks the champion, drivers still in, and who was eliminated when', () => {
    const [d1, d2, d3] = elimination.drivers
    expect(status(elimination, d2, 2)).toEqual({ label: 'Champion', tone: 'champion' })
    expect(status(elimination, d1, 2)).toEqual({ label: 'Out after R2', tone: 'out' })
    expect(status(elimination, d1, 1)).toEqual({ label: 'Seed 1', tone: 'alive' })
    expect(status(elimination, d3, 2)).toBeNull()
    expect(status(chase, chase.drivers[0], 0)).toBeNull()
  })
})

describe('chartDrivers', () => {
  it('draws the playoff field once it is set', () => {
    expect(chartDrivers(chase, 'playoffs').map((d) => d.driver_id)).toEqual([2, 1])
    expect(chartDrivers(chase, 'everyone')).toHaveLength(3)
  })

  it('draws the field and the drivers just outside it before then', () => {
    const early = { ...chase, drivers: chase.drivers.map((d) => ({ ...d, playoff_seed: null })) }
    expect(chartDrivers(early, 'playoffs')).toHaveLength(3)
  })
})

describe('highlights', () => {
  it('starts with the top of the latest standings', () => {
    expect([...defaultHighlights(chase)]).toEqual([
      [2, 0],
      [1, 1],
      [3, 2],
    ])
  })

  it('keeps colors on the drivers who stay and reuses freed slots', () => {
    let h = new Map([
      [10, 0],
      [11, 1],
    ])
    h = toggleHighlight(h, 10)
    expect([...h]).toEqual([[11, 1]])
    h = toggleHighlight(h, 12)
    expect(h.get(12)).toBe(0)
    expect(h.get(11)).toBe(1)
  })

  it('ignores additions once every slot is used', () => {
    const full = new Map([0, 1, 2, 3, 4].map((k) => [k, k]))
    expect(toggleHighlight(full, 99)).toEqual(full)
  })
})

describe('spreadLabels', () => {
  it('pushes crowded labels apart within bounds', () => {
    expect(spreadLabels([50, 52, 51], 10, 0, 100)).toEqual([50, 70, 60])
    expect(spreadLabels([98, 99], 10, 0, 100)).toEqual([90, 100])
  })
})

describe('formatSummary', () => {
  it('describes the single reset of the Chase', () => {
    expect(formatSummary(chase)).toContain('Points reset once, from 2,100 for the leader down to 2,075')
  })

  it('lists the elimination path', () => {
    expect(formatSummary(elimination)).toContain('(2 → 1)')
  })
})

describe('axis and values', () => {
  it('formats values per chart mode', () => {
    expect(formatValue(3, 'position')).toBe('P3')
    expect(formatValue(0, 'gap')).toBe('Leader')
    expect(formatValue(-12, 'gap')).toBe('−12')
    expect(formatValue(2501, 'points')).toBe('2,501')
  })

  it('picks round tick steps', () => {
    expect(niceTicks(0, 2500)).toEqual([0, 500, 1000, 1500, 2000, 2500])
    expect(niceTicks(-130, 0)).toEqual([-100, -50, 0])
    expect(niceTicks(1, 40)).toEqual([10, 20, 30, 40])
  })
})
