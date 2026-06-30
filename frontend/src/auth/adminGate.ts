import type { Viewer } from '../viewer/schema.ts'

export type AdminGate = 'pending' | 'allow' | 'deny'

// The /admin route guard's decision, kept pure so it's testable without a DOM.
// `undefined` = the viewer is still loading (hold, so no admin UI flashes);
// `null` = the fetch failed (treat as non-admin). Otherwise gate on the role.
export function adminGate(viewer: Viewer | null | undefined): AdminGate {
  if (viewer === undefined) return 'pending'
  if (viewer === null) return 'deny'
  return viewer.roles.includes('admin') ? 'allow' : 'deny'
}
