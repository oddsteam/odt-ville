// The ground-tile mapper is admin-only now (#162, follow-up to #154). The old
// standalone page (ground-mapper.html) had no Keycloak/App wiring, so it let
// ANYONE open the authoring tool. Ground-tile authoring lives behind the admin
// console's Ground Tiles tab, which RequireAdmin gates on the same `admin`
// realm role (#100) as the server-side ground-tile save gate. Retire the
// standalone entry by bouncing it there, so the one guard is the only door.
export const GROUND_MAPPER_ROUTE = '/admin/ground'

// The slice of `window.location` we depend on — narrow so the redirect is
// unit-testable with a fake (the real Location satisfies it).
export interface Redirectable {
  replace(url: string): void
}

export function redirectToAdminMapper(location: Redirectable): void {
  location.replace(GROUND_MAPPER_ROUTE)
}
