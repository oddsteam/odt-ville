import { describe, expect, test } from 'vitest'

import { hasAdmin, revokeControl, rowBadges, sourceLabel } from './roleBadges.ts'

const [appBadge, keycloakBadge] = rowBadges([
  { role: 'admin', source: 'app', granted_by: 'Ivy Issuer', granted_at: '2026-08-15T00:00:00Z' },
  { role: 'admin', source: 'keycloak' },
])

describe('sourceLabel', () => {
  // The App/Keycloak distinction is the whole reason the badge carries a
  // source: the next slices (#431/#432) can revoke App grants but not Keycloak.
  test('names each source the way the roster reads it', () => {
    expect(sourceLabel('app')).toBe('App')
    expect(sourceLabel('keycloak')).toBe('Keycloak')
  })
})

describe('rowBadges', () => {
  test('turns each role into a labelled, keyable badge with its audit line', () => {
    expect(
      rowBadges([
        { role: 'admin', source: 'app', granted_by: 'Ivy Issuer', granted_at: '2026-08-15T00:00:00Z' },
        { role: 'admin', source: 'keycloak' },
      ]),
    ).toEqual([
      { key: 'admin:app', role: 'admin', source: 'App', grantedBy: 'Ivy Issuer', grantedAt: '2026-08-15T00:00:00Z' },
      { key: 'admin:keycloak', role: 'admin', source: 'Keycloak', grantedBy: null, grantedAt: null },
    ])
  })

  test('a user with no roles renders no badges', () => {
    expect(rowBadges([])).toEqual([])
  })
})

describe('hasAdmin', () => {
  // The "Make admin" button only appears where there is no admin yet — a
  // re-grant is a no-op, but offering it on an existing admin reads as broken.
  test('is true when any badge is admin, whatever its source', () => {
    expect(hasAdmin([{ role: 'admin', source: 'keycloak' }])).toBe(true)
    expect(hasAdmin([{ role: 'admin', source: 'app', granted_by: null }])).toBe(true)
  })

  test('is false for a user with no admin badge', () => {
    expect(hasAdmin([])).toBe(false)
  })
})

describe('revokeControl', () => {
  // An App grant on someone else's row is the one revocable case.
  test('enables revoke for an App grant on another user', () => {
    expect(revokeControl(appBadge, false)).toEqual({
      enabled: true,
      title: 'Revoke this admin grant',
    })
  })

  // Self-lockout guard: you cannot revoke your own admin (the server 422s too).
  test('disables revoke on your own row, pointing at the lockout', () => {
    const control = revokeControl(appBadge, true)
    expect(control.enabled).toBe(false)
    expect(control.title).toMatch(/your own/i)
  })

  // A Keycloak realm role is not ours to remove — the tooltip names Keycloak.
  test('disables revoke for a Keycloak badge, pointing at Keycloak', () => {
    const control = revokeControl(keycloakBadge, false)
    expect(control.enabled).toBe(false)
    expect(control.title).toMatch(/Keycloak/i)
  })
})
