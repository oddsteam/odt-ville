// The authored-map walkability rule (#131, Tiled T3). Pins the pure composition
// the collision-mask slice adds on top of the tracer's in-bounds-only rule (#91):
// a cell is walkable only when it is in bounds AND not painted into the collision
// mask AND not blocked by a placed entity's walk-mask. Each veto is independent —
// none overrides another — so this locks all three failure modes.

import { describe, expect, it } from 'vitest'
import {
  mapWalkable,
  isMasked,
  entityBlockedFor,
  entityEdgeBlockedFor,
  entityDoorCells,
  entityLadderFor,
  entityOverhangFor,
  entityForegroundFor,
  mapPlayerDepth,
  slidePlayerDepth,
  peerDepth,
  peerSlideDepth,
  spawnTile,
  MAP_PLAYER_DEPTH,
  MAP_PLAYER_OVERHANG_DEPTH,
  MAP_PLAYER_FOREGROUND_DEPTH,
} from './mapWalk.ts'
import { MAP_ENTITY_DEPTH, MAP_ENTITY_FG_DEPTH } from '../../kernel/mapRenderer.ts'
import type { BakedEntity } from '../../kernel/schema.ts'

const SIZE = { cols: 3, rows: 3 }

describe('isMasked', () => {
  it('reads a row-major blocked grid, treating missing cells as unmasked', () => {
    const mask = [
      [false, true, false],
      [false, false, false],
    ]
    expect(isMasked(mask, 1, 0)).toBe(true)
    expect(isMasked(mask, 0, 0)).toBe(false)
    // Out of the mask's rows/cols reads as unmasked, never throws.
    expect(isMasked(mask, 2, 5)).toBe(false)
    expect(isMasked(undefined, 0, 0)).toBe(false)
  })
})

describe('mapWalkable', () => {
  it('walks any in-bounds cell when nothing is masked (tracer parity)', () => {
    const walk = mapWalkable(SIZE)
    expect(walk(0, 0)).toBe(true)
    expect(walk(2, 2)).toBe(true)
    // Out of bounds is still refused.
    expect(walk(-1, 0)).toBe(false)
    expect(walk(3, 0)).toBe(false)
  })

  it('blocks a masked cell and walks its unmasked neighbours', () => {
    const mask = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ]
    const walk = mapWalkable(SIZE, mask)
    expect(walk(1, 1)).toBe(false) // masked → blocked
    expect(walk(0, 1)).toBe(true) // unmasked → walks
    expect(walk(1, 0)).toBe(true)
  })

  it('still applies an entity walk-mask on top of the collision mask', () => {
    const mask = [
      [true, false, false],
      [false, false, false],
      [false, false, false],
    ]
    const entityBlocked = (x: number, y: number) => x === 2 && y === 2
    const walk = mapWalkable(SIZE, mask, entityBlocked)
    expect(walk(0, 0)).toBe(false) // collision mask blocks
    expect(walk(2, 2)).toBe(false) // entity walk-mask blocks
    expect(walk(1, 1)).toBe(true) // neither blocks → walks
  })
})

describe('entityBlockedFor', () => {
  const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }

  it('blocks nothing for props with no walk-mask (today authored maps)', () => {
    const blocked = entityBlockedFor([prop])
    expect(blocked(1, 1)).toBe(false)
  })

  it('blocks every solid footprint cell anchored at the entity origin', () => {
    // A 2×2 house at (1,1) whose top-left is solid, rest walkable overhang.
    const house: BakedEntity = {
      kind: 'house',
      tileset: 't',
      frame: 0,
      x: 1,
      y: 1,
      walk_mask: ['#.', '..'],
    }
    const blocked = entityBlockedFor([house])
    expect(blocked(1, 1)).toBe(true) // '#' at footprint (0,0) → cell (1,1)
    expect(blocked(2, 1)).toBe(false) // '.' overhang
    expect(blocked(1, 2)).toBe(false)
    expect(blocked(0, 0)).toBe(false) // outside footprint
  })
})

describe('entityLadderFor', () => {
  it('marks no cell for entities with no walk-mask (today authored maps)', () => {
    const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }
    const ladder = entityLadderFor([prop])
    expect(ladder(1, 1)).toBe(false)
  })

  it('marks only L footprint cells anchored at the entity origin', () => {
    // A 2×2 building at (1,1) with a ladder cell at footprint (1,0); the rest is
    // solid/porch and must not read as a ladder.
    const house: BakedEntity = {
      kind: 'house',
      tileset: 't',
      frame: 0,
      x: 1,
      y: 1,
      walk_mask: ['#L', '..'],
    }
    const ladder = entityLadderFor([house])
    expect(ladder(2, 1)).toBe(true) // 'L' at footprint (1,0) → cell (2,1)
    expect(ladder(1, 1)).toBe(false) // '#' solid
    expect(ladder(1, 2)).toBe(false) // '.' porch
    expect(ladder(0, 0)).toBe(false) // outside footprint
  })

  it('collects ladder cells from every placed object that paints them', () => {
    const a: BakedEntity = { kind: 'prop', object_id: 1, x: 0, y: 0, walk_mask: ['L'] }
    const b: BakedEntity = { kind: 'prop', object_id: 2, x: 5, y: 5, walk_mask: ['L'] }
    const ladder = entityLadderFor([a, b])
    expect(ladder(0, 0)).toBe(true)
    expect(ladder(5, 5)).toBe(true)
  })
})

describe('entityOverhangFor', () => {
  it('marks no cell for entities with no walk-mask (today authored maps)', () => {
    const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }
    const overhang = entityOverhangFor([prop])
    expect(overhang(1, 1)).toBe(false)
  })

  it('marks only o footprint cells anchored at the entity origin', () => {
    // A 2×2 building at (1,1) with an overhang cell at footprint (1,0); the rest
    // is solid/porch/ladder and must not read as an overhang.
    const house: BakedEntity = {
      kind: 'house',
      tileset: 't',
      frame: 0,
      x: 1,
      y: 1,
      walk_mask: ['#o', '.L'],
    }
    const overhang = entityOverhangFor([house])
    expect(overhang(2, 1)).toBe(true) // 'o' at footprint (1,0) → cell (2,1)
    expect(overhang(1, 1)).toBe(false) // '#' solid
    expect(overhang(1, 2)).toBe(false) // '.' porch
    expect(overhang(2, 2)).toBe(false) // 'L' ladder
    expect(overhang(0, 0)).toBe(false) // outside footprint
  })

  it('collects overhang cells from every placed object that paints them', () => {
    const a: BakedEntity = { kind: 'prop', object_id: 1, x: 0, y: 0, walk_mask: ['o'] }
    const b: BakedEntity = { kind: 'prop', object_id: 2, x: 5, y: 5, walk_mask: ['o'] }
    const overhang = entityOverhangFor([a, b])
    expect(overhang(0, 0)).toBe(true)
    expect(overhang(5, 5)).toBe(true)
  })
})

describe('entityForegroundFor', () => {
  const OBJ = (fg: string | null) => ({ footprint_w: 2, footprint_h: 2, fg_mask: fg })

  it('marks no cell when the referenced object carries no fg mask', () => {
    const e = { kind: 'prop', object_id: 1, x: 1, y: 1 }
    const fg = entityForegroundFor([e], new Map([[1, OBJ(null)]]))
    expect(fg(1, 1)).toBe(false)
    expect(fg(2, 2)).toBe(false)
  })

  it("marks the full footprint of an fg-masked object anchored at the entity origin", () => {
    // A 2×2 tree with foliage at (1,1); the whole footprint is the walk-behind
    // band (the avatar drops under the masked canopy there).
    const e = { kind: 'prop', object_id: 7, x: 1, y: 1 }
    const fg = entityForegroundFor([e], new Map([[7, OBJ('data:png')]]))
    expect(fg(1, 1)).toBe(true)
    expect(fg(2, 1)).toBe(true)
    expect(fg(1, 2)).toBe(true)
    expect(fg(2, 2)).toBe(true)
    expect(fg(0, 0)).toBe(false) // outside footprint
    expect(fg(3, 3)).toBe(false)
  })

  it('ignores legacy tileset entities and dangling object references', () => {
    const legacy = { kind: 'prop', tileset: 't', frame: 0, x: 0, y: 0 }
    const dangling = { kind: 'prop', object_id: 99, x: 4, y: 4 }
    const fg = entityForegroundFor([legacy, dangling], new Map([[7, OBJ('data:png')]]))
    expect(fg(0, 0)).toBe(false)
    expect(fg(4, 4)).toBe(false)
  })

  it('collects foreground cells from every fg-masked object placed', () => {
    const a = { kind: 'prop', object_id: 1, x: 0, y: 0 }
    const b = { kind: 'prop', object_id: 2, x: 5, y: 5 }
    const objects = new Map([
      [1, { footprint_w: 1, footprint_h: 1, fg_mask: 'a' }],
      [2, { footprint_w: 1, footprint_h: 1, fg_mask: 'b' }],
    ])
    const fg = entityForegroundFor([a, b], objects)
    expect(fg(0, 0)).toBe(true)
    expect(fg(5, 5)).toBe(true)
  })
})

describe('slidePlayerDepth', () => {
  // Mid-step the avatar overlaps both cells, so the depth has to hold for the
  // whole slide — stepping *out* of an overhang cell must not pop it over the
  // art it is still in front of (the NPC head case, #294).
  const overhangAt = (ox: number, oy: number) => (x: number, y: number) => x === ox && y === oy
  const never = () => false

  it('keeps the walk-under depth while stepping out of an overhang cell', () => {
    const d = slidePlayerDepth({ x: 2, y: 2 }, { x: 2, y: 1 }, overhangAt(2, 2), never)
    expect(d).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })

  it('takes the walk-under depth from the start of a step into one', () => {
    const d = slidePlayerDepth({ x: 2, y: 1 }, { x: 2, y: 2 }, overhangAt(2, 2), never)
    expect(d).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })

  it('stays above the entity band when neither end overhangs', () => {
    expect(slidePlayerDepth({ x: 0, y: 0 }, { x: 1, y: 0 }, never, never)).toBe(MAP_PLAYER_DEPTH)
  })
})

describe('peerDepth', () => {
  // A peer avatar sorts against the local avatar's row exactly as a placed NPC
  // does (#403): south covers, north draws behind — and the row delta is the
  // whole key, so two peers on different rows also order against each other.
  it('draws a peer south of the local avatar over it, one north behind it', () => {
    expect(peerDepth(5, 3, false, false)).toBeGreaterThan(MAP_PLAYER_DEPTH)
    expect(peerDepth(1, 3, false, false)).toBeLessThan(MAP_PLAYER_DEPTH)
  })

  it('sits a peer on the local avatar’s own row in the flat band', () => {
    expect(peerDepth(3, 3, false, false)).toBe(MAP_PLAYER_DEPTH)
  })

  it('orders two peers on the same side by their own rows', () => {
    // Both south of the avatar (row 0); the further-south peer draws in front.
    expect(peerDepth(5, 0, false, false)).toBeGreaterThan(peerDepth(2, 0, false, false))
  })

  it('lets an overhang cell win over the row rule — a peer under art stays under it', () => {
    // Far south (would draw well in front) but standing under an object's art.
    expect(peerDepth(9, 0, true, false)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })

  it('lets a foreground cell win over the row rule', () => {
    expect(peerDepth(9, 0, false, true)).toBe(MAP_PLAYER_FOREGROUND_DEPTH)
  })

  it('lets overhang win when a cell is both', () => {
    expect(peerDepth(9, 0, true, true)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })
})

describe('peerSlideDepth', () => {
  const overhangAt = (ox: number, oy: number) => (x: number, y: number) => x === ox && y === oy
  const never = () => false

  it('sorts a plain step against the local avatar’s row, keyed on the destination', () => {
    // Stepping to row 5 while the avatar is on row 3 → south → covers it.
    const d = peerSlideDepth({ x: 2, y: 4 }, { x: 2, y: 5 }, 3, never, never)
    expect(d).toBe(peerDepth(5, 3, false, false))
    expect(d).toBeGreaterThan(MAP_PLAYER_DEPTH)
  })

  it('holds the walk-under band while either end of the step overhangs', () => {
    const out = peerSlideDepth({ x: 2, y: 2 }, { x: 2, y: 1 }, 3, overhangAt(2, 2), never)
    expect(out).toBe(MAP_PLAYER_OVERHANG_DEPTH)
    const into = peerSlideDepth({ x: 2, y: 1 }, { x: 2, y: 2 }, 3, overhangAt(2, 2), never)
    expect(into).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })
})

describe('mapPlayerDepth', () => {
  it('lifts the avatar above every placed entity off an overhang cell', () => {
    // The avatar draws over props by default (walk-over).
    expect(mapPlayerDepth(false)).toBe(MAP_PLAYER_DEPTH)
    expect(mapPlayerDepth(false)).toBeGreaterThan(MAP_ENTITY_DEPTH)
  })

  it('drops the avatar below the entity band on an overhang cell (walk-under)', () => {
    expect(mapPlayerDepth(true)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
    // Below the object's sprite so its art overhangs the avatar...
    expect(mapPlayerDepth(true)).toBeLessThan(MAP_ENTITY_DEPTH)
    // ...but still above the ground stacks (depth 0) so the floor doesn't occlude.
    expect(mapPlayerDepth(true)).toBeGreaterThan(0)
  })

  it('slots the avatar between the base art and the fg overlay on a foreground cell (#168)', () => {
    const d = mapPlayerDepth(false, true)
    expect(d).toBe(MAP_PLAYER_FOREGROUND_DEPTH)
    // Above the object's base sprite so the avatar's body still draws over it...
    expect(d).toBeGreaterThan(MAP_ENTITY_DEPTH)
    // ...but below the fg overlay so the masked canopy covers the avatar...
    expect(d).toBeLessThan(MAP_ENTITY_FG_DEPTH)
    // ...and below the default depth, so stepping south of the footprint (no
    // longer a foreground cell) lifts the avatar back over the overlay.
    expect(d).toBeLessThan(MAP_PLAYER_DEPTH)
  })

  it('lets overhang win when a cell is both overhang and foreground', () => {
    // Fully-behind (overhang) beats partly-behind (foreground): the object's
    // whole art overhangs the avatar, not just its masked canopy.
    expect(mapPlayerDepth(true, true)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })
})

describe('entityEdgeBlockedFor', () => {
  it('blocks no border for entities with no edge mask (today authored maps)', () => {
    const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }
    const edge = entityEdgeBlockedFor([prop])
    expect(edge(1, 1, 2, 1)).toBe(false)
  })

  it('blocks the marked border while leaving the cell itself walkable', () => {
    // A 1×1 fence at (1,1) whose east side is impassable (EDGE_E = 2 → hex '2').
    const fence: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1, edge_mask: ['2'] }
    const edge = entityEdgeBlockedFor([fence])
    // Stepping east across the fenced border is blocked...
    expect(edge(1, 1, 2, 1)).toBe(true)
    // ...symmetrically, stepping west back over it is blocked too.
    expect(edge(2, 1, 1, 1)).toBe(true)
    // Other directions across the same cell are free (only the east side marked).
    expect(edge(1, 1, 1, 0)).toBe(false)
    expect(edge(1, 1, 1, 2)).toBe(false)
    // The cell itself stays walkable — entityBlockedFor governs that, not edges.
    expect(entityBlockedFor([fence])(1, 1)).toBe(false)
  })

  it('is symmetric when only the neighbour marks the shared side', () => {
    // Cell (2,1) marks its west side impassable (EDGE_W = 8 → hex '8').
    const wall: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 2, y: 1, edge_mask: ['8'] }
    const edge = entityEdgeBlockedFor([wall])
    expect(edge(1, 1, 2, 1)).toBe(true) // from-cell has no mask, to-cell's west blocks
    expect(edge(2, 1, 1, 1)).toBe(true)
  })

  it('reads unmasked cells (space / dot) as free borders', () => {
    const fence: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 0, y: 0, edge_mask: ['. '] }
    const edge = entityEdgeBlockedFor([fence])
    expect(edge(0, 0, 1, 0)).toBe(false)
  })
})

describe('entityDoorCells', () => {
  it('marks no cell for entities with no door anchor (today authored maps)', () => {
    const prop: BakedEntity = { kind: 'prop', tileset: 't', frame: 0, x: 1, y: 1 }
    const door = entityDoorCells([prop])
    expect(door(1, 1)).toBe(false)
  })

  it('resolves the door cell at the entity (x,y) plus the anchor offset', () => {
    // A building at (2,2) whose entrance is one column right, top row (dx=1,dy=0).
    const house: BakedEntity = { kind: 'prop', object_id: 7, x: 2, y: 2, door_dx: 1, door_dy: 0 }
    const door = entityDoorCells([house])
    expect(door(3, 2)).toBe(true) // (2+1, 2+0)
    expect(door(2, 2)).toBe(false) // footprint corner, not the door
  })

  it('makes the door cell walkable even though its walk-mask marks it solid', () => {
    // A solid 2×2 building whose bottom-centre-ish cell (dx=1,dy=1) is the door.
    const house: BakedEntity = { kind: 'prop', object_id: 7, x: 0, y: 0, walk_mask: ['##', '##'], door_dx: 1, door_dy: 1 }
    const blocked = entityBlockedFor([house])
    const door = entityDoorCells([house])
    // The walk-mask alone would block the whole footprint...
    expect(blocked(1, 1)).toBe(true)
    // ...but the runtime composes the door override the same way MapScene does,
    // so the entrance cell walks while the rest of the footprint stays solid.
    const walkable = mapWalkable({ cols: 3, rows: 3 }, undefined, (x, y) => blocked(x, y) && !door(x, y))
    expect(walkable(1, 1)).toBe(true) // door cell — enterable
    expect(walkable(0, 0)).toBe(false) // solid footprint — blocked
  })

  it('collects door cells from every entity that carries an anchor', () => {
    const a: BakedEntity = { kind: 'prop', object_id: 1, x: 0, y: 0, door_dx: 0, door_dy: 1 }
    const b: BakedEntity = { kind: 'prop', object_id: 2, x: 5, y: 5, door_dx: 2, door_dy: 0 }
    const door = entityDoorCells([a, b])
    expect(door(0, 1)).toBe(true)
    expect(door(7, 5)).toBe(true)
  })
})

// Named entry spawns (#84): a portal lands the avatar at the target map's
// authored spawn point; unknown/absent ids keep the grid-centre fallback so
// direct navigation to a spawn-less map still works.
describe('spawnTile', () => {
  const map = { cols: 8, rows: 6, spawns: [{ id: 'from-atrium', x: 1, y: 4 }] }
  // A map with a door back to `atrium`, plus a second portal elsewhere so the
  // reciprocal lookup has to match on targetNode rather than "the only portal".
  const doored = {
    cols: 8,
    rows: 6,
    zones: [
      { x: 7, y: 2, payload: { kind: 'portal', targetNode: 'plaza' } },
      { x: 2, y: 5, payload: { kind: 'portal', targetNode: 'atrium' } },
      { x: 0, y: 0, payload: { kind: 'link', url: 'https://example.test' } },
    ],
  }

  it('resolves a named entry spawn', () => {
    expect(spawnTile(map, 'from-atrium')).toEqual({ x: 1, y: 4 })
  })

  it('falls back to the grid centre for an unknown or absent spawn id', () => {
    expect(spawnTile(map, 'nope')).toEqual({ x: 4, y: 3 })
    expect(spawnTile({ cols: 8, rows: 6 })).toEqual({ x: 4, y: 3 })
  })

  it('lands on the door back to where you came from when no spawn is named', () => {
    expect(spawnTile(doored, undefined, 'atrium')).toEqual({ x: 2, y: 5 })
    expect(spawnTile(doored, undefined, 'plaza')).toEqual({ x: 7, y: 2 })
  })

  it('prefers a named spawn over the door you came through', () => {
    const both = { ...doored, spawns: [{ id: 'balcony', x: 6, y: 1 }] }
    expect(spawnTile(both, 'balcony', 'atrium')).toEqual({ x: 6, y: 1 })
  })

  it('falls through a dangling spawn id to the door rather than the centre', () => {
    expect(spawnTile(doored, 'typo', 'atrium')).toEqual({ x: 2, y: 5 })
  })

  it('takes the first authored portal when several lead back to the source', () => {
    const twice = {
      cols: 8,
      rows: 6,
      zones: [
        { x: 3, y: 3, payload: { kind: 'portal', targetNode: 'atrium' } },
        { x: 5, y: 1, payload: { kind: 'portal', targetNode: 'atrium' } },
      ],
    }
    expect(spawnTile(twice, undefined, 'atrium')).toEqual({ x: 3, y: 3 })
  })

  it('falls back to the centre when nothing leads back to the source', () => {
    expect(spawnTile(doored, undefined, 'nowhere')).toEqual({ x: 4, y: 3 })
    expect(spawnTile(map, undefined, 'atrium')).toEqual({ x: 4, y: 3 })
  })
})
