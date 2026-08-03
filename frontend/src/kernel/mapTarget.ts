// The write side of the per-target registry contract (#303). MapScene reads
// these keys through mapRenderer (preloadBakedMap et al.) in this same kernel;
// this is the one place they're written, so the standalone route (MapPage) and
// the in-game portal (PhaserGame.enterPortal) can't drift on what a target
// carries. Add a new per-target input here and both entry paths get it.
// Session-stable keys (`npcs`, `characterManifest`) are set once at game boot
// and stay out of this. Pure — lives in the kernel so the game can import it.

export type MapTarget = {
  map: unknown
  objects: unknown
  bakedNpcs: unknown
  // The Standees standing on this map (#369, ADR-0015): runtime-placed cutouts
  // read alongside the map, never baked into it. A per-target input like
  // bakedNpcs, so it rides the same single chokepoint and both entry paths get it.
  bakedStandees: unknown
  entrySpawnId: string | undefined
  // The presence/voice handles for a multiplayer target, or null for a solo
  // one. Set every hop so a solo target clears the previous map's room/mesh.
  presence: unknown
  voice: unknown
}

export function applyMapTarget(
  registry: { set: (key: string, value: unknown) => unknown },
  target: MapTarget,
) {
  registry.set('bakedMap', target.map)
  registry.set('bakedObjects', target.objects)
  registry.set('bakedNpcs', target.bakedNpcs)
  registry.set('bakedStandees', target.bakedStandees)
  registry.set('entrySpawnId', target.entrySpawnId)
  registry.set('presence', target.presence)
  registry.set('voice', target.voice)
}
