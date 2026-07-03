// Pure walking rules for an authored map (the MapScene tracer, first slice of
// #91). Extracted from the scene so they are unit-testable apart from Phaser —
// the same discipline as movement.ts / mapRenderer.ts. MapScene wires these
// into the shared stepTile loop.

import { TILE, PLAYER_FEET_LIFT } from '../constants.js'
import type { Tile } from './movement.ts'

interface GridSize {
  cols: number
  rows: number
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
