// The door as a Portal (#111, ADR-0005): a community carrying an authored
// interior Node makes its door travel — the same `portal` payload #84's travel
// dispatches. `entry` is the conventional id of an interior's entry spawn.
// Null (no authored interior) keeps the hardcoded InteriorScene, the v0 Node.
//
// This module once also held the tile-char/sight-cell arrival list; #255
// deleted it — arrivals now run against the town's zones through the kernel
// detectors, and the door is a plain lookup in the scene.
export function interiorPortal(community: {
  interior_node_slug?: string | null
}): { kind: 'portal'; targetNode: string; entrySpawnId: string } | null {
  const slug = community.interior_node_slug
  return slug ? { kind: 'portal', targetNode: slug, entrySpawnId: 'entry' } : null
}
