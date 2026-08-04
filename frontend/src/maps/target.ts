// The shared load half of "point MapScene at a map" (#303): both the standalone
// route (MapPage) and the in-game portal (VillagePage.handlePortal) assemble a
// target's boot inputs here, so neither can drop a per-target input the other
// keeps (placed-NPC rigs, #294/#295, did exactly that). The write half —
// setting the registry keys — is applyMapTarget in the kernel (mapTarget.ts).

import { runEdge } from '../lib/runEdge.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { objectIdsFrom } from './props.ts'
import { loadNpcRigs, loadManifestById } from '../character/service.ts'
import { StandeesService } from '../standees/service.ts'
import type { BakedMap } from '../kernel/schema.ts'
import type { Npc } from '../catalog/npcs/schema.ts'

// The per-target inputs a loaded map needs at boot: the tile objects its
// entities reference (ADR-0008), the rigs its placed NPCs draw from (#294), and
// the Standees standing on it (#369, ADR-0015) with their owners' rigs resolved
// by reference. The map is passed in, not fetched, because the two paths obtain
// it differently (a slug via MapsService, or the editor's stashed draft).
export async function loadMapBundle(map: BakedMap, npcs: readonly Npc[]) {
  const objects = await runEdge(TileObjectsService.getMany(objectIdsFrom(map.entities)))
  const placed = new Set(map.entities.filter((e) => e.kind === 'npc').map((e) => e.npc_id))
  const bakedNpcs = await loadNpcRigs(npcs.filter((n) => placed.has(n.id)))
  const bakedStandees = await loadStandees(map)
  return { objects, bakedNpcs, bakedStandees }
}

// The Standees for a map, each carrying its owner's rig resolved by reference
// (`character_manifest_id → manifest`, never a copy — ADR-0015). Standees live on
// multiplayer maps only, so a solo target skips the fetch entirely. A dangling
// owner (no manifest) rides through with `manifest: null`; the game layer draws
// the bundled fallback for it rather than crashing.
async function loadStandees(map: BakedMap) {
  if (!map.multiplayer) return []
  const standees = await runEdge(StandeesService.list(map.slug)).catch(() => [])
  return Promise.all(
    standees.map(async (s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      message: s.message,
      // The full Placard (#372): the detail body and who left it, carried
      // through as plain data so the game can echo it on press-A without ever
      // rendering the panel or importing a data service (ADR-0004).
      detail: s.detail,
      ownerName: s.owner_name,
      ownerAvatarUrl: s.owner_avatar_url,
      // The reply link the owner supplied (#373): carried through as plain data
      // for the shell's Placard button; `replyHref` gates the click-through.
      replyLink: s.reply_link,
      // Whether the caller owns this cutout (#370): drives the pick-up affordance
      // on press-A, resolved server-side against the authenticated caller.
      mine: s.mine,
      // When the cutout retires itself (#374). Carried into the scene so it can
      // take the Standee down the moment it passes, with no round trip — the
      // load already excluded the ones past it.
      expiresAt: s.expires_at,
      manifest: s.character_manifest_id != null ? await loadManifestById(s.character_manifest_id) : null,
    })),
  )
}
