// Building art registry. Every roof/body pair under assets/buildings/ is
// auto-discovered by Vite's glob import, so adding a new building is just:
//
//   node scripts/prep-building.mjs my-tower.png skyline-tower
//
// which writes `skyline-tower-roof.png` + `skyline-tower-body.png` here and
// they register themselves under the key `skyline-tower`. No wiring edits.
//
// The game draws each building as a stacked roof (top 36%) + body (bottom
// 64%), both stretched to the plot footprint — see TownScene.addBuildingSprite.

const roofs = import.meta.glob('./assets/buildings/*-roof.png', {
  eager: true,
  query: '?url',
  import: 'default',
})
const bodies = import.meta.glob('./assets/buildings/*-body.png', {
  eager: true,
  query: '?url',
  import: 'default',
})

function keyOf(filePath) {
  const m = filePath.match(/\/([^/]+)-(?:roof|body)\.png$/)
  return m ? m[1] : null
}

// { guild: { roofUrl, bodyUrl }, 'skyline-tower': { ... }, ... }
export const BUILDINGS = {}
for (const [p, url] of Object.entries(roofs)) {
  const key = keyOf(p)
  if (key) BUILDINGS[key] = { ...(BUILDINGS[key] || {}), roofUrl: url }
}
for (const [p, url] of Object.entries(bodies)) {
  const key = keyOf(p)
  if (key) BUILDINGS[key] = { ...(BUILDINGS[key] || {}), bodyUrl: url }
}

// Prefer the original guild art as the fallback; otherwise first registered.
export const DEFAULT_BUILDING = BUILDINGS.guild ? 'guild' : Object.keys(BUILDINGS)[0]

// The one resolution rule for a plot's mapped building (#292): the
// community's assigned object → the active 'building' object → null, which
// means the bundled roof/body art (DEFAULT_BUILDING). A dangling assignment
// (id missing from `byId`) falls through like no assignment.
export function buildingObjectFor(community, byId, active) {
  const id = community?.tile_object_id
  if (id != null && byId?.[id]) return byId[id]
  return active ?? null
}
