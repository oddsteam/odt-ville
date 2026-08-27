// Tiled importer (ADR-0007) — the "Tiled is a producer" conversion. A Tiled JSON
// export (embedded tilesets) becomes the existing BakedGround shape: each tile
// layer's gids resolve to concrete (tileset, frame) cells (frame = gid − firstgid
// via the owning tileset), layer order → depth. The human's tile choices in Tiled
// *are* the autotile resolution (ADR-0003), so like the Map Baker this is pure —
// no DOM, no Phaser — and the runtime blits the result with no second render path.
//
// A bad export fails loudly here, never at play: the four import-time checks
// (external tileset, non-32px grid, margin/spacing, unresolvable PNG) are listed
// as clear reasons. The PNG-exists check is the async adapter below; everything
// structural is this pure core. Object layers (incl. `collisions`) are ignored —
// an imported map starts fully walkable; collision is authored in-app (ADR-0007).

import type { BakedGround, BakedLayer } from '../kernel/schema.ts'

const GRID = 32 // the map's tile size; ADR-0007 pins imports to a 32px grid.

// Tiled sets the top three gid bits as flip/rotation flags; the low 29 are the
// real global id. Mask them so a flipped cell still resolves to its tileset.
const GID_MASK = 0x1fffffff

// Just the Tiled fields the importer reads — the export carries far more.
interface TiledTileset {
  firstgid: number
  name?: string
  source?: string
  image?: string
  tilewidth?: number
  tileheight?: number
  margin?: number
  spacing?: number
}
interface TiledLayer {
  type: string
  name?: string
  data?: number[]
}
interface TiledMap {
  tilewidth?: number
  tileheight?: number
  width?: number
  height?: number
  tilesets?: TiledTileset[]
  layers?: TiledLayer[]
}

export class TiledImportError extends Error {
  reasons: string[]
  constructor(reasons: string[]) {
    super(reasons.join('; '))
    this.name = 'TiledImportError'
    this.reasons = reasons
  }
}

// Every structural check a Tiled export must pass to import. Collected (not
// short-circuited) so one bad export reports all its problems at once.
function validate(map: TiledMap): string[] {
  const reasons: string[] = []
  if (map.tilewidth !== GRID || map.tileheight !== GRID) {
    reasons.push(`map tiles are ${map.tilewidth}×${map.tileheight}, must be ${GRID}×${GRID}`)
  }
  for (const ts of map.tilesets ?? []) {
    const who = ts.name ?? ts.source ?? `firstgid ${ts.firstgid}`
    if (ts.source || !ts.image) {
      reasons.push(`tileset "${who}" is an external reference — embed it in the export`)
      continue // its other fields are absent; nothing more to check
    }
    if (ts.tilewidth !== GRID || ts.tileheight !== GRID) {
      reasons.push(`tileset "${who}" tiles are ${ts.tilewidth}×${ts.tileheight}, must be ${GRID}×${GRID}`)
    }
    if (ts.margin || ts.spacing) {
      reasons.push(`tileset "${who}" has margin/spacing — must be 0`)
    }
  }
  return reasons
}

// The tileset owning a gid: the one with the greatest firstgid ≤ gid. `sorted`
// is descending by firstgid so the first match wins.
function ownerOf(sorted: TiledTileset[], gid: number): TiledTileset | undefined {
  return sorted.find((ts) => ts.firstgid <= gid)
}

// Convert a validated Tiled map's tile layers into a BakedGround. Each non-empty
// gid becomes one baked layer at its tile-layer depth; object layers are skipped.
function toGround(map: TiledMap): BakedGround {
  const cols = map.width ?? 0
  const rows = map.height ?? 0
  const sorted = [...(map.tilesets ?? [])].sort((a, b) => b.firstgid - a.firstgid)
  const tileLayers = (map.layers ?? []).filter((l) => l.type === 'tilelayer')

  const cells: BakedLayer[][][] = []
  for (let y = 0; y < rows; y++) {
    const row: BakedLayer[][] = []
    for (let x = 0; x < cols; x++) row.push([])
    cells.push(row)
  }

  const used = new Set<string>()
  tileLayers.forEach((layer, index) => {
    // Ground depths live below the entity band (MAP_ENTITY_DEPTH = 1): the map
    // baker stacks terrains at index*0.1, so tile layers scale the same way —
    // a raw layer index of 1+ would draw *over* placed props. Clamped so even
    // a 10+-layer export stays under the band.
    const depth = Math.min(index, 9) * 0.1
    const data = layer.data ?? []
    for (let i = 0; i < cols * rows; i++) {
      const gid = (data[i] ?? 0) & GID_MASK
      if (!gid) continue // empty cell
      const owner = ownerOf(sorted, gid)
      if (!owner?.name) continue // no owning tileset — dropped rather than mis-framed
      used.add(owner.name)
      cells[Math.floor(i / cols)][i % cols].push({
        tileset: owner.name,
        frame: gid - owner.firstgid,
        depth,
      })
    }
  })

  // Only the tilesets actually referenced, as the runtime's {name, cell} shape.
  const tilesets = (map.tilesets ?? [])
    .filter((ts) => ts.name && used.has(ts.name))
    .map((ts) => ({ name: ts.name as string, cell: GRID }))

  return { cols, rows, tilesets, cells }
}

// Pure Tiled JSON → BakedGround. Throws TiledImportError (with a `reasons` list)
// on any structural failure. PNG resolvability is a separate async check below.
export function importTiledGround(map: TiledMap): BakedGround {
  const reasons = validate(map)
  if (reasons.length) throw new TiledImportError(reasons)
  return toGround(map)
}

// The fourth import-time check (ADR-0007): every referenced tileset PNG resolves
// under the repo convention. `pngExists(name)` is the thin async adapter around
// the pure core — the editor passes a real fetch/HEAD probe, tests pass a stub.
export async function importTiledMap(
  map: TiledMap,
  pngExists: (name: string) => Promise<boolean>,
): Promise<BakedGround> {
  const ground = importTiledGround(map) // structural checks first — throws loudly
  const missing = await Promise.all(
    ground.tilesets.map(async (ts) => ((await pngExists(ts.name)) ? null : ts.name)),
  )
  const unresolved = missing.filter((n): n is string => n !== null)
  if (unresolved.length) {
    throw new TiledImportError(
      unresolved.map((n) => `tileset PNG "${n}.png" not found under public/maps/tilesets/`),
    )
  }
  return ground
}
