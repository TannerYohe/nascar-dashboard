import { describe, expect, it } from 'vitest'

import { APP_NAME, pageTitle } from './brand'

describe('pageTitle', () => {
  it('appends the site name to the page name', () => {
    expect(pageTitle('Standings')).toBe(`Standings · ${APP_NAME}`)
  })
})
