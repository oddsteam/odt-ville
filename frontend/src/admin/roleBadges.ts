import type { RoleBadge } from '../auth/schema.ts'

// Pure roster-render helpers, kept out of the JSX so they are testable without
// a DOM (this repo has no DOM test harness). The App/Keycloak wording is the
// point of the whole page: App grants are revocable in this console (#431/#432),
// Keycloak realm roles are not.

// The human name for a badge's source.
export function sourceLabel(source: RoleBadge['source']): string {
  return source === 'keycloak' ? 'Keycloak' : 'App'
}

export interface Badge {
  readonly key: string
  readonly role: string
  readonly source: string
  // The App grant's audit line (#431): who issued it and when. Null on a
  // Keycloak badge — it is a realm role, not our grant — and on a console grant.
  readonly grantedBy: string | null
  readonly grantedAt: string | null
}

// The badges a roster row renders from its role list — labelled and keyed. An
// empty list renders nothing; the row shows the no-role dash instead.
export function rowBadges(roles: readonly RoleBadge[]): readonly Badge[] {
  return roles.map((r) => ({
    key: `${r.role}:${r.source}`,
    role: r.role,
    source: sourceLabel(r.source),
    grantedBy: r.granted_by ?? null,
    grantedAt: r.granted_at ?? null,
  }))
}

// Whether a row already holds admin, from any source. The "Make admin" button
// (#431) only shows where this is false: a re-grant is idempotent, but offering
// the button on an existing admin reads as a broken no-op.
export function hasAdmin(roles: readonly RoleBadge[]): boolean {
  return roles.some((r) => r.role === 'admin')
}
