import { describe, expect, test } from 'vitest'

import { rowBadges, sourceLabel } from './roleBadges.ts'

describe('sourceLabel', () => {
  // The App/Keycloak distinction is the whole reason the badge carries a
  // source: the next slices (#431/#432) can revoke App grants but not Keycloak.
  test('names each source the way the roster reads it', () => {
    expect(sourceLabel('app')).toBe('App')
    expect(sourceLabel('keycloak')).toBe('Keycloak')
  })
})

describe('rowBadges', () => {
  test('turns each role into a labelled, keyable badge', () => {
    expect(
      rowBadges([
        { role: 'admin', source: 'app' },
        { role: 'admin', source: 'keycloak' },
      ]),
    ).toEqual([
      { key: 'admin:app', role: 'admin', source: 'App' },
      { key: 'admin:keycloak', role: 'admin', source: 'Keycloak' },
    ])
  })

  test('a user with no roles renders no badges', () => {
    expect(rowBadges([])).toEqual([])
  })
})
