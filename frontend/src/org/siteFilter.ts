// The roster's site filter (#389). Client-side: the roster is one admin-gated
// request of ~500 rows that the page already holds, so filtering it needs no
// second round trip.

import type { Employee } from './schema.ts'

// Every site somebody is placed at, once each. Ordered case-insensitively —
// site names are as written upstream (`ttb`, `KTC`), so a codepoint sort would
// bury the lowercase ones at the bottom of the dropdown.
export const siteNames = (employees: readonly Employee[]): string[] =>
  [...new Set(employees.flatMap((e) => e.sites.map((s) => s.name)))].sort((a, b) =>
    a.localeCompare(b),
  )

// Placement is many-to-many, so this is a `some`: a person split across two
// clients appears under both. Empty selection = no filter.
export const bySite = (employees: readonly Employee[], site: string): readonly Employee[] =>
  site ? employees.filter((e) => e.sites.some((s) => s.name === site)) : employees
