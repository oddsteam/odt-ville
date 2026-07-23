// The shared load half of "point MapScene at a map" (#303): both the standalone
// route (MapPage) and the in-game portal (VillagePage.handlePortal) assemble a
// target's boot inputs here, so neither can drop a per-target input the other
// keeps (placed-NPC rigs, #294/#295, did exactly that). The write half —
// setting the registry keys — is applyMapTarget in the kernel (mapTarget.ts).

import { runEdge } from '../lib/runEdge.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { objectIdsFrom } from './props.ts'
import { loadNpcRigs } from '../character/service.ts'
import type { BakedMap } from '../kernel/schema.ts'
import type { Npc } from '../catalog/npcs/schema.ts'

// The per-target inputs a loaded map needs at boot: the tile objects its
// entities reference (ADR-0008) and the rigs its placed NPCs draw from (#294).
// The map is passed in, not fetched, because the two paths obtain it
// differently (a slug via MapsService, or the editor's stashed draft).
export async function loadMapBundle(map: BakedMap, npcs: readonly Npc[]) {
  const objects = await runEdge(TileObjectsService.getMany(objectIdsFrom(map.entities)))
  const placed = new Set(map.entities.filter((e) => e.kind === 'npc').map((e) => e.npc_id))
  const bakedNpcs = await loadNpcRigs(npcs.filter((n) => placed.has(n.id)))
  return { objects, bakedNpcs }
}
