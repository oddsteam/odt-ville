import { describe, expect, it } from 'vitest'
import { createPayload, siteOptions } from './clientOnboarding.ts'

describe('siteOptions', () => {
  it('returns the fetched sites when the current value is blank', () => {
    expect(siteOptions(['KTB', 'IFS'], '')).toEqual(['KTB', 'IFS'])
    expect(siteOptions(['KTB', 'IFS'], null)).toEqual(['KTB', 'IFS'])
  })

  it('keeps a current value that is not in the fetched list (legacy site stays selectable)', () => {
    expect(siteOptions(['KTB', 'IFS'], 'OldSite')).toEqual(['OldSite', 'KTB', 'IFS'])
  })

  it('does not duplicate a current value already in the list', () => {
    expect(siteOptions(['KTB', 'IFS'], 'KTB')).toEqual(['KTB', 'IFS'])
  })
})

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
