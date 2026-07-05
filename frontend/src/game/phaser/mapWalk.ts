// Pure walking rules for an authored map (the MapScene tracer, first slice of
// #91). Extracted from the scene so they are unit-testable apart from Phaser —
// the same discipline as movement.ts / mapRenderer.ts. MapScene wires these
// into the shared stepTile loop.

import { TILE, PLAYER_FEET_LIFT } from '../constants.js'
import type { Tile } from './movement.ts'
import type { BakedEntity } from '../../maps/schema.ts'

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
        if (row[dx] === '#') blocked.add(`${e.x + dx},${e.y + dy}`)
      }
    }
  }
  return (x, y) => blocked.has(`${x},${y}`)
}

// Where the player appears on an authored map. The map document carries no
// spawn point yet, so the tracer starts at the grid centre (flooring keeps it
// on-grid for even sizes: 8×6 → (4,3)).
export function spawnTile({ cols, rows }: GridSize): Tile {
  return { x: Math.floor(cols / 2), y: Math.floor(rows / 2) }
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
