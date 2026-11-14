import { describe, expect, it } from 'vitest'

import type { StatRecord } from '../../api/types'
import { bestByAvgFinish, minStartsFor, ordinal, percent, positionsGained, seasonSpan, signed } from './model'

function record(overrides: Partial<StatRecord>): StatRecord {
  return {
    starts: 0,
    wins: 0,
    podiums: 0,
    top_5: 0,
    top_10: 0,
    poles: 0,
    pole_wins: 0,
    laps_led: 0,
    laps_completed: 0,
    races_led: 0,
    dnfs: 0,
    crashes: 0,
    avg_start: null,
    avg_finish: null,
    deepest_win_start: null,
    ...overrides,
  }
}

describe('formatting', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [22, '22nd'],
    [113, '113th'],
  ])('ordinal %i', (n, text) => expect(ordinal(n)).toBe(text))

  it('rounds percentages, keeping a decimal under 10%', () => {
    expect(percent(3, 40)).toBe('7.5%')
    expect(percent(20, 40)).toBe('50%')
    expect(percent(0, 40)).toBe('0%')
    expect(percent(1, 0)).toBe('–')
  })

  it('spans seasons', () => {
    expect(seasonSpan(2017, 2025)).toBe('2017–2025')
    expect(seasonSpan(2025, 2025)).toBe('2025')
  })

  it('signs numbers', () => {
    expect(signed(2.5)).toBe('+2.5')
    expect(signed(-3)).toBe('−3')
    expect(signed(0)).toBe('0')
  })
})

describe('insights', () => {
  it('measures places gained from start to finish', () => {
    expect(positionsGained(record({ avg_start: 12.4, avg_finish: 10.1 }))).toBe(2.3)
    expect(positionsGained(record({ avg_start: null, avg_finish: 10 }))).toBeNull()
  })

  it('picks the best average finish among rows with enough starts', () => {
    const rows = [
      { name: 'one start', record: record({ starts: 1, avg_finish: 1 }) },
      { name: 'two starts', record: record({ starts: 2, avg_finish: 2 }) },
      { name: 'good', record: record({ starts: 4, avg_finish: 8 }) },
      { name: 'better', record: record({ starts: 3, avg_finish: 6 }) },
    ]
    expect(bestByAvgFinish(rows, minStartsFor(rows))?.name).toBe('better')
    expect(bestByAvgFinish([], 1)).toBeUndefined()
  })

  it('asks for fewer starts when no one has many', () => {
    expect(minStartsFor([{ record: record({ starts: 2 }) }])).toBe(2)
    expect(minStartsFor([{ record: record({ starts: 30 }) }])).toBe(3)
  })
})
