// Pure walking rules for an authored map (the MapScene tracer, first slice of
// #91). Extracted from the scene so they are unit-testable apart from Phaser —
// the same discipline as movement.ts / mapRenderer.ts. MapScene wires these
// into the shared stepTile loop.

import { TILE, PLAYER_FEET_LIFT } from '../constants.js'
import { maskCharSolid, maskCharLadder, maskCharOverhang, EDGE_N, EDGE_E, EDGE_S, EDGE_W } from '../../kernel/walkMask.ts'
import { MAP_ENTITY_DEPTH } from '../../kernel/mapRenderer.ts'
import type { Tile } from './movement.ts'
import type { BakedEntity } from '../../kernel/schema.ts'

interface GridSize {
  cols: number
  rows: number
}

// The collision mask (#131): a row-major "blocked" grid painted in the editor,
// `mask[y][x] === true` vetoes walkability. It is not a Placed Entity — no art,
// no trigger — it only blocks. Undefined / short rows read as unmasked, so a map
// with nothing masked walks exactly as the in-bounds tracer did.
export type CollisionMask = ReadonlyArray<ReadonlyArray<boolean>>

// Is cell (x,y) painted into the collision mask? Out-of-grid reads unmasked and
// never throws, so callers can probe freely.
export function isMasked(mask: CollisionMask | undefined, x: number, y: number): boolean {
  return mask?.[y]?.[x] === true
}

// The cells a set of placed entities block, as a fast predicate. Each entity may
// carry a `walk_mask` footprint (row-major chars, '#' = solid) anchored at its
// (x,y) — the same vocabulary as the town interior mask. A prop with no mask
// contributes nothing. This is the placed-entity half of walkability, kept apart
// from the collision mask so neither overrides the other (#131).
export function entityBlockedFor(
  entities: ReadonlyArray<BakedEntity>,
): (x: number, y: number) => boolean {
  const blocked = new Set<string>()
  for (const e of entities) {
    const mask = e.walk_mask
    if (!mask) continue
    for (let dy = 0; dy < mask.length; dy++) {
      const row = mask[dy] ?? ''
      for (let dx = 0; dx < row.length; dx++) {
        if (maskCharSolid(row[dx])) blocked.add(`${e.x + dx},${e.y + dy}`)
      }
    }
  }
  return (x, y) => blocked.has(`${x},${y}`)
}

// The ladder cells a set of placed entities contribute, as a fast predicate
// (#54, #211). Each entity may carry a `walk_mask` footprint anchored at its
// (x,y); a cell painted 'L' is walkable like a porch but drives the avatar's
// climb posture (walk fallback when the character has no climb frames). Mirrors
// town.ts `isLadderCell` for the authored-map path — MapScene reads it to decide
// climb vs walk while moving. Generic: any placed object with 'L' cells
// contributes, not just buildings. Entities with no walk mask contribute nothing.
export function entityLadderFor(
  entities: ReadonlyArray<BakedEntity>,
): (x: number, y: number) => boolean {
  const ladders = new Set<string>()
  for (const e of entities) {
    const mask = e.walk_mask
    if (!mask) continue
    for (let dy = 0; dy < mask.length; dy++) {
      const row = mask[dy] ?? ''
      for (let dx = 0; dx < row.length; dx++) {
        if (maskCharLadder(row[dx])) ladders.add(`${e.x + dx},${e.y + dy}`)
      }
    }
  }
  return (x, y) => ladders.has(`${x},${y}`)
}

// The overhang cells a set of placed entities contribute, as a fast predicate
// (#44, #210). Each entity may carry a `walk_mask` footprint anchored at its
// (x,y); a cell painted 'o' is walkable like a porch but the object's art must
// draw *over* the avatar (walk-under), so the avatar's depth stays below the
// object while standing there. Mirrors town.ts `playerDepthAt`'s overhang branch
// for the authored-map path — MapScene reads it to decide the avatar's depth.
// Generic: any placed object with 'o' cells contributes, not just buildings.
// Entities with no walk mask contribute nothing.
export function entityOverhangFor(
  entities: ReadonlyArray<BakedEntity>,
): (x: number, y: number) => boolean {
  const overhangs = new Set<string>()
  for (const e of entities) {
    const mask = e.walk_mask
    if (!mask) continue
    for (let dy = 0; dy < mask.length; dy++) {
      const row = mask[dy] ?? ''
      for (let dx = 0; dx < row.length; dx++) {
        if (maskCharOverhang(row[dx])) overhangs.add(`${e.x + dx},${e.y + dy}`)
      }
    }
  }
  return (x, y) => overhangs.has(`${x},${y}`)
}

// The cells over which a placed object's foreground overlay covers the avatar
// (#168) — its footprint (the walk-behind band). An object carrying an `fg_mask`
// stamps a second, mask-clipped copy of its art at MAP_ENTITY_FG_DEPTH (just
// above the base sprite); while the avatar stands on the footprint its depth
// drops to MAP_PLAYER_FOREGROUND_DEPTH (between the two) so the masked canopy
// covers it, and the avatar's default depth beats the overlay once south of the
// footprint. The mask + footprint live on the object, not the entity, so this
// takes the resolved objects. Mirrors town.ts's buildingOverlayDepth south band
// for the flat-depth map path; generic across any object kind with a mask (#99).
// Entities without an fg_mask contribute nothing.
export function entityForegroundFor(
  entities: ReadonlyArray<BakedEntity>,
  objects: ReadonlyMap<number, { footprint_w: number; footprint_h: number; fg_mask?: string | null }>,
): (x: number, y: number) => boolean {
  const cells = new Set<string>()
  for (const e of entities) {
    if (e.object_id == null) continue
    const obj = objects.get(e.object_id)
    if (!obj?.fg_mask) continue
    for (let dy = 0; dy < obj.footprint_h; dy++) {
      for (let dx = 0; dx < obj.footprint_w; dx++) {
        cells.add(`${e.x + dx},${e.y + dy}`)
      }
    }
  }
  return (x, y) => cells.has(`${x},${y}`)
}

// The authored-map avatar depth: above every placed entity's sprite (they sit at
// MAP_ENTITY_DEPTH in mapRenderer) so the avatar walks over props by default,
// but an overhang 'o' cell drops it just below that band so the object's art
// draws over the avatar (walk-under, #210). A foreground cell (#168) drops it
// only between the base art and the object's fg overlay (MAP_ENTITY_FG_DEPTH), so
// the masked canopy covers the avatar while its body still draws over the base;
// overhang wins when a cell is both (fully behind beats partly behind). Mirrors
// town.ts's posture — the avatar depth is dynamic per step, the entity sprites
// static. Both dropped depths stay above the ground stacks (< MAP_ENTITY_DEPTH
// for overhang, > it for foreground) so only the object occludes, not the floor.
export const MAP_PLAYER_DEPTH = 1000
export const MAP_PLAYER_OVERHANG_DEPTH = MAP_ENTITY_DEPTH - 0.5
export const MAP_PLAYER_FOREGROUND_DEPTH = MAP_ENTITY_DEPTH + 0.5
export function mapPlayerDepth(isOverhang: boolean, isForeground = false): number {
  if (isOverhang) return MAP_PLAYER_OVERHANG_DEPTH
  if (isForeground) return MAP_PLAYER_FOREGROUND_DEPTH
  return MAP_PLAYER_DEPTH
}

// The depth to hold for a whole tile-step (#210, #294). Mid-slide the avatar
// overlaps both cells, so it stays under the entity band while EITHER end of the
// step is an overhang cell: taking the destination's depth alone pops the avatar
// over the art it is still standing in front of the instant it steps *out* —
// most visible walking away from a placed NPC, whose head fills the cell behind
// it. The caller restores the landed cell's own depth on arrival.
export function slidePlayerDepth(
  from: Tile,
  to: Tile,
  isOverhang: (x: number, y: number) => boolean,
  isForeground: (x: number, y: number) => boolean,
): number {
  return mapPlayerDepth(
    isOverhang(from.x, from.y) || isOverhang(to.x, to.y),
    isForeground(from.x, from.y) || isForeground(to.x, to.y),
  )
}

// A peer avatar's depth (#403). A peer is character-shaped exactly like a placed
// NPC, so it sorts against the local avatar's row the same way (`npcDepth`): a
// peer on a row further south covers the avatar, one further north draws behind.
// The row delta is the whole key rather than a two-way front/behind flag, so two
// peers on different rows also order against each other — the "sort against each
// other by row" half of the issue. An overhang or foreground cell still wins
// (#402): a peer standing under an object's art stays under it whatever its row,
// so mapPlayerDepth's walk-under / masked bands take precedence exactly as they
// do for the local avatar.
export function peerDepth(
  peerRow: number,
  avatarRow: number,
  isOverhang: boolean,
  isForeground = false,
): number {
  if (isOverhang || isForeground) return mapPlayerDepth(isOverhang, isForeground)
  return MAP_PLAYER_DEPTH + (peerRow - avatarRow)
}

// The depth to hold for a whole peer tile-step. Mirrors `slidePlayerDepth`: while
// either end of the step overhangs (or is foreground) the walk-under / masked
// band holds for the whole slide, so a peer stepping out of an overhang cell does
// not pop over the art it is still in front of; otherwise the peer sorts against
// the local avatar's row, keyed on the destination cell it is stepping onto —
// the same row the local avatar's own step re-sorts NPCs against.
export function peerSlideDepth(
  from: Tile,
  to: Tile,
  avatarRow: number,
  isOverhang: (x: number, y: number) => boolean,
  isForeground: (x: number, y: number) => boolean,
): number {
  return peerDepth(
    to.y,
    avatarRow,
    isOverhang(from.x, from.y) || isOverhang(to.x, to.y),
    isForeground(from.x, from.y) || isForeground(to.x, to.y),
  )
}

// The impassable cell borders a set of placed entities contribute, as a fast
// transition-aware predicate (#53, #207). Each entity may carry an `edge_mask`
// footprint anchored at its (x,y): one hex digit per cell packing the four
// side bits (EDGE_N/E/S/W). Unlike `entityBlockedFor` (whole cells), this blocks
// only the *border between* two otherwise-walkable cells. Transition-aware
// companion to `entityBlockedFor`, mirroring town.ts `edgeBlocked`: the border
// is blocked when EITHER adjacent cell's edge mask marks the shared side, so a
// step is symmetric. Entities with no edge mask contribute nothing.
export function entityEdgeBlockedFor(
  entities: ReadonlyArray<BakedEntity>,
): (fx: number, fy: number, tx: number, ty: number) => boolean {
  // Accumulate the OR of every entity's side bits per cell — overlapping edge
  // masks combine rather than the last one winning.
  const bits = new Map<string, number>()
  for (const e of entities) {
    const mask = e.edge_mask
    if (!mask) continue
    for (let dy = 0; dy < mask.length; dy++) {
      const row = mask[dy] ?? ''
      for (let dx = 0; dx < row.length; dx++) {
        const b = parseInt(row[dx], 16)
        if (Number.isFinite(b) && b !== 0) {
          const key = `${e.x + dx},${e.y + dy}`
          bits.set(key, (bits.get(key) ?? 0) | b)
        }
      }
    }
  }
  const sideAt = (x: number, y: number, bit: number) => ((bits.get(`${x},${y}`) ?? 0) & bit) !== 0
  return (fx, fy, tx, ty) => {
    const dx = tx - fx
    const dy = ty - fy
    const fromSide = dx === 1 ? EDGE_E : dx === -1 ? EDGE_W : dy === 1 ? EDGE_S : EDGE_N
    const toSide = dx === 1 ? EDGE_W : dx === -1 ? EDGE_E : dy === 1 ? EDGE_N : EDGE_S
    return sideAt(fx, fy, fromSide) || sideAt(tx, ty, toSide)
  }
}

// The door cells a set of placed entities contribute, as a fast predicate (#29,
// #212). Each entity may carry a door anchor (`door_dx`/`door_dy`) — the single
// footprint cell that is its entrance, as an offset from (x,y). The resolved
// door cell is (x + door_dx, y + door_dy). Mirrors town.ts's always-walkable
// door: the authored-map runtime treats this cell as the walkable entry point,
// overriding the entity's own walk-mask so a solid building is still enterable.
// Entities with no door anchor contribute nothing.
export function entityDoorCells(
  entities: ReadonlyArray<BakedEntity>,
): (x: number, y: number) => boolean {
  const doors = new Set<string>()
  for (const e of entities) {
    if (e.door_dx == null || e.door_dy == null) continue
    doors.add(`${e.x + e.door_dx},${e.y + e.door_dy}`)
  }
  return (x, y) => doors.has(`${x},${y}`)
}

// Where the player appears on an authored map. A portal names the target's
// entry spawn (#84) — resolved from the map's authored `spawns`; an unknown or
// absent id falls back to the grid centre (flooring keeps it on-grid for even
// sizes: 8×6 → (4,3)) so direct navigation to a spawn-less map still works.
export function spawnTile(
  map: GridSize & { spawns?: ReadonlyArray<{ id: string; x: number; y: number }> },
  spawnId?: string,
): Tile {
  const spawn = spawnId ? map.spawns?.find((s) => s.id === spawnId) : undefined
  if (spawn) return { x: spawn.x, y: spawn.y }
  return { x: Math.floor(map.cols / 2), y: Math.floor(map.rows / 2) }
}

// The tracer walkability rule: any cell inside the authored grid. Terrain-aware
// collision replaces this when the map document carries it (#82, #85) — the
// scene passes the returned predicate straight into stepTile's `walkable`.
export function inBoundsWalkable({ cols, rows }: GridSize): (x: number, y: number) => boolean {
  return (x, y) => x >= 0 && y >= 0 && x < cols && y < rows
}

// Full authored-map walkability (#131): in bounds ∧ not masked ∧ not blocked by
// an entity's walk-mask. It extends the in-bounds tracer rule with the collision
// mask and placed-entity collision — all three are independent vetoes, none
// overrides another, so a cell walks only when every rule allows it.
// `entityBlocked` defaults to nothing blocked (today's prop-only maps).
export function mapWalkable(
  size: GridSize,
  mask?: CollisionMask,
  entityBlocked: (x: number, y: number) => boolean = () => false,
): (x: number, y: number) => boolean {
  const inBounds = inBoundsWalkable(size)
  return (x, y) => inBounds(x, y) && !isMasked(mask, x, y) && !entityBlocked(x, y)
}

// Tile → world px for the player's feet, so they land on the destination
// tile's floor. Same math as TownScene/InteriorScene: the sprite is bottom-
// anchored at the tile's south edge; the bundled rpg-char-01 art needs
// PLAYER_FEET_LIFT to compensate for its padded box, a manifest sprite is
// tightly cropped and needs none.
export function feetWorldXY(tile: Tile, usingManifest: boolean): { x: number; y: number } {
  return {
    x: tile.x * TILE + TILE / 2,
    y: (tile.y + 1) * TILE + (usingManifest ? 0 : PLAYER_FEET_LIFT),
  }
}
