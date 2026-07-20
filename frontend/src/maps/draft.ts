// Preview-in-game handoff (#91): the decorate editor assembles its current
// edits into the runtime BakedMap document and stashes it in storage; the play
// shell takes it back out through the schema decoder. The draft crosses as the
// same document contract GET /maps/:slug publishes — the editor never imports
// the runtime (ADR-0004), and a draft that breaks the contract fails the
// decode instead of half-rendering.

import * as Schema from 'effect/Schema'
import { BakedMap } from '../kernel/schema.ts'
import type { BakedEntity, Zone } from '../kernel/schema.ts'

// The play route MapPage serves the stashed draft on (registered in App.tsx).
export const DRAFT_PLAY_PATH = '/maps/draft/preview'

const KEY = 'odt-ville:map-draft'
const decode = Schema.decodeUnknownSync(BakedMap)

// The loaded document with the editor's current layers applied — cleared
// layers drop off entirely, mirroring how the decorate PATCH keeps a clean
// document server-side.
export function draftMap(
  baked: BakedMap,
  entities: readonly BakedEntity[],
  collision: ReadonlyArray<ReadonlyArray<boolean>> | null,
  zones: readonly Zone[],
  multiplayer: boolean,
): BakedMap {
  const { collision: _c, zones: _z, ...rest } = baked
  return {
    ...rest,
    entities,
    multiplayer,
    ...(collision ? { collision } : {}),
    ...(zones.length ? { zones } : {}),
  }
}

export function stashDraft(doc: BakedMap, storage: Storage = sessionStorage): void {
  storage.setItem(KEY, JSON.stringify(doc))
}

export function takeDraft(storage: Storage = sessionStorage): BakedMap | null {
  const raw = storage.getItem(KEY)
  return raw ? decode(JSON.parse(raw)) : null
}
