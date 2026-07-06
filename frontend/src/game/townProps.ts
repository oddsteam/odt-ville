// Town prop producer (ADR-0008, #141). The generated hometown resolves its
// scattered foliage — boundary trees and flower clusters — to the same placed-
// entity draws the authored map emits, so both producers feed the one shared
// entity loader (entityLoader.ts) instead of the town keeping bespoke
// `_treeObject` / `_flowerGroup` / `_flowerSingle` plumbing.
//
// Pure + Phaser-free: geometry comes from town.ts (T-cell boundary, flower
// scatter clustering); the caller resolves each role's art to a texture key +
// footprint (an admin-saved object's `obj.<id>` or a bundled fallback) and this
// module lays the draws out. The depth/anchor policy that preserves the town's
// look lives here — trees bottom-anchor and y-sort so the avatar passes in
// front of / behind them; flowers are a flat overlay above the ground.

import { planFlowers, type TileGrid } from './town.ts'
import type { EntityDraw } from './phaser/entityLoader.ts'

// Resolved art for one prop role: which texture to stamp and its footprint in
// tiles (may be fractional, e.g. the tree's 1.4×1.8). Null → the role has no
// art available, so nothing is placed for it.
export interface PropArt {
  key: string
  w: number
  h: number
}

// The three roles the hometown places. `flowerSingle` carries only a key: a
// single always stamps at 1×1 (leftover/lone '*' cells), regardless of the
// authored footprint — the group footprint drives clustering + group size.
export interface TownPropArt {
  tree: PropArt | null
  flowerGroup: PropArt | null
  flowerSingle: { key: string } | null
}

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

// Resolve the town's foliage to shared-loader draws, split by role so the
// renderer can bucket trees and flowers into their own dev-inspector layers.
// Trees stamp one bottom-anchored, y-sorted sprite per 'T' cell; flowers cluster
// the '*' scatter into full-footprint groups plus 1×1 singles (planFlowers,
// #27), all at the flat flower depth. A role with no art contributes nothing.
export function townPropDraws(
  town: TileGrid,
  art: TownPropArt,
): { trees: EntityDraw[]; flowers: EntityDraw[] } {
  const trees: EntityDraw[] = []
  if (art.tree) {
    for (const { col, row } of treeCells(town)) {
      trees.push({
        key: art.tree.key,
        x: col + 0.5,
        y: row + 1,
        w: art.tree.w,
        h: art.tree.h,
        depth: treeDepth(row),
        originX: 0.5,
        originY: 1,
      })
    }
  }

  // planFlowers floors the footprint to whole tiles for the cluster grid, but we
  // stamp at the real footprint so fractional art keeps its size (pre-#141
  // behaviour). A 1×1 group footprint degenerates to one group per '*'.
  const gw = art.flowerGroup?.w ?? 1
  const gh = art.flowerGroup?.h ?? 1
  const { groups, singles } = planFlowers(town, gw, gh)
  const flowers: EntityDraw[] = []
  if (art.flowerGroup) {
    for (const g of groups) {
      flowers.push({ key: art.flowerGroup.key, x: g.x, y: g.y, w: gw, h: gh, depth: FLOWER_DEPTH })
    }
  }
  if (art.flowerSingle) {
    for (const s of singles) {
      flowers.push({ key: art.flowerSingle.key, x: s.x, y: s.y, w: 1, h: 1, depth: FLOWER_DEPTH })
    }
  }

  return { trees, flowers }
}
