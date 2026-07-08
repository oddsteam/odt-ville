// Town prop producer (ADR-0008, #141, #173). `buildTown` resolves the Hometown
// Policy's active kinds to `{kind:"prop", object_id, x, y}` placed entities at
// generation time; this module turns those references into the shared-loader
// draws (entityLoader.ts) the renderer stamps — the same kernel path the
// authored map uses.
//
// Pure + Phaser-free. The depth/anchor policy that preserves the town's look
// lives here — trees bottom-anchor and y-sort so the avatar passes in front of
// / behind them; flowers are a flat overlay above the ground. Which role an
// entity plays is recovered by matching its object_id back to the policy.

import type { HometownPolicy, PlacedEntity, TileGrid } from './town.ts'
import { objectTextureKey, type EntityDraw } from './phaser/entityLoader.ts'

// Trees overflow their tile upward and y-sort against the avatar: bottom-
// anchored, depth banded by the base row so a lower (souther) tree draws in
// front. Matches the pre-#141 addTallProps depth.
const treeDepth = (row: number) => (row + 1) * 10 - 1

// Flowers are a flat overlay: above the ground fills, below props/buildings/
// player (issue #25) — kept at a fixed depth so they never draw over the avatar.
const FLOWER_DEPTH = 0.35

// Every boundary 'T' cell in row-major order — the tree line the town draws
// around its edge. Pure function of the grid, so rows added as the town grows
// get trees automatically.
export function treeCells(town: TileGrid): Array<{ col: number; row: number }> {
  const out: Array<{ col: number; row: number }> = []
  for (let y = 0; y < town.rows; y++) {
    for (let x = 0; x < town.cols; x++) {
      if (town.map[y][x] === 'T') out.push({ col: x, row: y })
    }
  }
  return out
}

// Resolve the town's placed entities to shared-loader draws, split by role so
// the renderer can bucket trees and flowers into their own dev-inspector
// layers. Trees stamp one bottom-anchored, y-sorted sprite per entity at the
// object's authored footprint; flower groups stamp their full footprint and
// singles 1×1, all at the flat flower depth. An entity matching no policy role
// draws nothing (like a dangling reference).
export function townPropDraws(
  entities: readonly PlacedEntity[],
  policy: HometownPolicy,
): { trees: EntityDraw[]; flowers: EntityDraw[] } {
  const trees: EntityDraw[] = []
  const flowers: EntityDraw[] = []
  for (const e of entities) {
    const key = objectTextureKey(e.object_id)
    if (e.object_id === policy.tree?.id) {
      trees.push({
        key,
        x: e.x + 0.5,
        y: e.y + 1,
        w: policy.tree.footprint_w || 1,
        h: policy.tree.footprint_h || 1,
        depth: treeDepth(e.y),
        originX: 0.5,
        originY: 1,
      })
    } else if (e.object_id === policy.flowerGroup?.id) {
      flowers.push({
        key,
        x: e.x,
        y: e.y,
        w: policy.flowerGroup.footprint_w || 1,
        h: policy.flowerGroup.footprint_h || 1,
        depth: FLOWER_DEPTH,
      })
    } else if (e.object_id === policy.flowerSingle?.id) {
      flowers.push({ key, x: e.x, y: e.y, w: 1, h: 1, depth: FLOWER_DEPTH })
    }
  }
  return { trees, flowers }
}
