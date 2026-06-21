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

// Choose the art key for a community. An explicit `community.building` key
// wins (set it server-side / in seed data to pin a building's look). With no
// override, everyone uses DEFAULT_BUILDING so existing towns are unchanged.
//
// To instead spread the available arts across communities for instant
// variety, swap the final return for:
//   const keys = Object.keys(BUILDINGS); return keys[index % keys.length]
export function buildingKeyFor(community /*, index */) {
  if (community?.building && BUILDINGS[community.building]) return community.building
  return DEFAULT_BUILDING
}
