import { describe, expect, it } from 'vitest'
import { createPayload } from './clientOnboarding.ts'

describe('createPayload', () => {
  it('trims the email and carries external + client_site', () => {
    expect(createPayload({ email: '  New.Client@client.test ', external: true, clientSite: 'KTB' }))
      .toEqual({ email: 'New.Client@client.test', external: true, client_site: 'KTB' })
  })

  it('folds a blank client_site to null (unassigned)', () => {
    expect(createPayload({ email: 'a@b.test', external: true, clientSite: '   ' }))
      .toEqual({ email: 'a@b.test', external: true, client_site: null })
  })

  it('keeps external false for a non-client pre-provision', () => {
    expect(createPayload({ email: 'staff@b.test', external: false, clientSite: '' }).external)
      .toBe(false)
  })
})
