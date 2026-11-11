import { describe, expect, it } from 'vitest'

import { cleanName, surname } from './format'

describe('driver names', () => {
  it.each([
    ['* Connor Zilisch(i)', 'Connor Zilisch'],
    ['Kyle Busch #', 'Kyle Busch'],
    ['Denny Hamlin (C)', 'Denny Hamlin'],
    ['* Bubba Wallace (P)', 'Bubba Wallace'],
    ['Martin Truex, Jr.', 'Martin Truex, Jr.'],
    [null, ''],
  ])('cleans %s', (raw, clean) => {
    expect(cleanName(raw)).toBe(clean)
  })

  it('takes the surname without markers or suffixes', () => {
    expect(surname('Ryan Blaney (P)')).toBe('Blaney')
    expect(surname('Ricky Stenhouse Jr')).toBe('Stenhouse')
    expect(surname(null)).toBe('')
  })
})
