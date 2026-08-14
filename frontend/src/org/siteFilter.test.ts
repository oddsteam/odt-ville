// The roster's site filter (#389). Placement is many-to-many, so "filter to
// ttb" is a `some`, not an equality — a person split across two clients shows
// under both.

import { describe, expect, it } from 'vitest'
import { bySite, siteNames } from './siteFilter.ts'
import type { Employee } from './schema.ts'

const person = (name: string, ...sites: string[]): Employee => ({
  id: 0,
  email: `${name.toLowerCase()}@example.test`,
  name,
  nickname: null,
  join_date: null,
  left_on: null,
  sites: sites.map((s) => ({ name: s, kind: 'client' as const })),
})

const roster = [person('Casey', 'Northwind'), person('Morgan', 'Northwind', 'Home'), person('Dana')]

describe('siteNames', () => {
  it('lists each site once, case-insensitively ordered', () => {
    expect(siteNames([...roster, person('Pat', 'ttb', 'KTC')])).toEqual([
      'Home',
      'KTC',
      'Northwind',
      'ttb',
    ])
  })

  it('is empty when nobody is placed', () => {
    expect(siteNames([person('Dana')])).toEqual([])
  })
})

describe('bySite', () => {
  it('keeps everyone placed at the site, including the multi-site person', () => {
    expect(bySite(roster, 'Northwind').map((e) => e.name)).toEqual(['Casey', 'Morgan'])
    expect(bySite(roster, 'Home').map((e) => e.name)).toEqual(['Morgan'])
  })

  it('no site selected means no filter — the unplaced stay visible', () => {
    expect(bySite(roster, '')).toEqual(roster)
  })
})
