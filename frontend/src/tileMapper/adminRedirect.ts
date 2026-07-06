// The tile-object mapper is admin-only now (#161, follow-up to #154). The old
// standalone page (tile-mapper.html) had no Keycloak/App wiring, so it let
// ANYONE open the authoring tool. Tile-object authoring lives behind the admin
// console's objects tab, which RequireAdmin gates on the same `admin` realm
// role (#100) as the server-side tile-object save gate. Retire the standalone
// entry by bouncing it there, so the one guard is the only door to the mapper.
export const TILE_MAPPER_ROUTE = '/admin/objects'

// The slice of `window.location` we depend on — narrow so the redirect is
// unit-testable with a fake (the real Location satisfies it).
export interface Redirectable {
  replace(url: string): void
}

export function redirectToAdminMapper(location: Redirectable): void {
  location.replace(TILE_MAPPER_ROUTE)
}
