// The character sprite-mapper is admin-only now (#154, ending non-admin
// character authoring — follow-up to #151). The old standalone page
// (sprite-mapper.html) had no Keycloak/App wiring, so it let ANYONE open the
// authoring tool. Character authoring lives behind the admin console's mapper
// tab, which RequireAdmin gates on the same `admin` realm role (#100) as the
// server-side POST /character_manifests save gate. Retire the standalone entry
// by bouncing it there, so the one guard is the only door to the mapper.
export const SPRITE_MAPPER_ROUTE = '/admin/sprites'

// The slice of `window.location` we depend on — narrow so the redirect is
// unit-testable with a fake (the real Location satisfies it).
export interface Redirectable {
  replace(url: string): void
}

export function redirectToAdminMapper(location: Redirectable): void {
  location.replace(SPRITE_MAPPER_ROUTE)
}
