// One Rev Village — top-down, Pokémon Game Boy-style town.
// Character sprites + the layout idea are borrowed from the local `pokemon-js`
// reference repo; the town here is generated and data-driven.

import frontStill from './assets/character/front-still.png'
import frontWalk1 from './assets/character/front-walk-1.png'
import frontWalk2 from './assets/character/front-walk-2.png'
import frontWalk3 from './assets/character/front-walk-3.png'
import backStill from './assets/character/back-still.png'
import backWalk1 from './assets/character/back-walk-1.png'
import backWalk2 from './assets/character/back-walk-2.png'
import backWalk3 from './assets/character/back-walk-3.png'
import leftStill from './assets/character/left-still.png'
import leftWalk1 from './assets/character/left-walk-1.png'
import leftWalk2 from './assets/character/left-walk-2.png'
import leftWalk3 from './assets/character/left-walk-3.png'
import rightStill from './assets/character/right-still.png'
import rightWalk1 from './assets/character/right-walk-1.png'
import rightWalk2 from './assets/character/right-walk-2.png'
import rightWalk3 from './assets/character/right-walk-3.png'

export const TILE = 48 // rendered px per tile
export const MOVE_MS = 170 // ms to slide one tile

// Player walk sprites, keyed by facing direction: [still, step-A, mid, step-B].
export const SPRITES = {
  down: [frontStill, frontWalk1, frontWalk2, frontWalk3],
  up: [backStill, backWalk1, backWalk2, backWalk3],
  left: [leftStill, leftWalk1, leftWalk2, leftWalk3],
  right: [rightStill, rightWalk1, rightWalk2, rightWalk3],
}

// ---- Town layout --------------------------------------------------------
// The town has N_PLOTS fixed building plots along one street. Houses (sorted
// by position_order) fill the plots in order — admins never place buildings,
// which keeps the "no admin x/y" rule. Empty plots are just grass, so adding
// a community immediately gives it a building.
export const N_PLOTS = 8
export const TOWN_ROWS = 20
export const TOWN_COLS = 4 + N_PLOTS * 4

// Each plot is 3 wide x 4 tall; the door is the bottom-centre tile.
export const PLOTS = Array.from({ length: N_PLOTS }, (_, i) => {
  const col = 2 + i * 4
  return { col, row: 4, w: 3, h: 4, doorCol: col + 1, doorRow: 7 }
})

const ENTRANCE_COL = 5 + Math.floor((N_PLOTS - 1) / 2) * 4
// Where a first-time visitor spawns (the path tile inside the entrance gap).
export const ENTRANCE = { x: ENTRANCE_COL, y: TOWN_ROWS - 2 }

// Ground layer, one character per tile:
//   T tree  s signpost  (blocked)   . grass  : path  * flower  (walkable)
function buildTownMap() {
  const doorCols = new Set(PLOTS.map((p) => p.doorCol))
  const key = (x, y) => `${x},${y}`
  const flowers = new Set(
    [
      [3, 12], [7, 16], [12, 13],
      [TOWN_COLS - 5, 12], [TOWN_COLS - 9, 16], [TOWN_COLS - 13, 14],
    ].map(([x, y]) => key(x, y)),
  )
  const trees = new Set(
    [
      [9, 14], [10, 14], [9, 15], [10, 15],
      [TOWN_COLS - 11, 13], [TOWN_COLS - 10, 13],
      [TOWN_COLS - 11, 14], [TOWN_COLS - 10, 14],
    ].map(([x, y]) => key(x, y)),
  )
  const last = TOWN_ROWS - 1
  const rows = []
  for (let y = 0; y < TOWN_ROWS; y++) {
    let row = ''
    for (let x = 0; x < TOWN_COLS; x++) {
      if (y === 0) row += 'T'
      else if (y === last) row += x === ENTRANCE_COL ? ':' : 'T'
      else if (x === 0 || x === TOWN_COLS - 1) row += 'T'
      else if (y === 10) row += ':' // main path
      else if ((y === 8 || y === 9) && doorCols.has(x)) row += ':' // door stubs
      else if (y >= 11 && x === ENTRANCE_COL) row += ':' // entrance path
      else if (y === last - 1 && x === ENTRANCE_COL - 1) row += 's' // signpost
      else if (y >= 11 && trees.has(key(x, y))) row += 'T'
      else if (y >= 11 && flowers.has(key(x, y))) row += '*'
      else row += '.'
    }
    rows.push(row)
  }
  return rows
}

export const TOWN_MAP = buildTownMap()

const WALKABLE = new Set(['.', ':', '*'])

export function tileChar(x, y) {
  if (y < 0 || y >= TOWN_ROWS || x < 0 || x >= TOWN_COLS) return 'T'
  return TOWN_MAP[y][x]
}

// Ground-layer walkability (callers add building collision on top).
export function isGroundWalkable(x, y) {
  return WALKABLE.has(tileChar(x, y))
}

export const CATEGORY_EMOJI = {
  compliance: '⚖️',
  product: '📦',
  branch_ops: '🏢',
  learning: '🎓',
  community: '☕',
}

export function categoryEmoji(key) {
  return CATEGORY_EMOJI[key] || '🏠'
}

export const BOARD_LABELS = {
  must_know: 'MUST KNOW',
  should_know: 'SHOULD KNOW',
  nice_to_know: 'NICE TO KNOW',
}

export const BOARD_ORDER = ['must_know', 'should_know', 'nice_to_know']

export const PRIORITY_RANK = { urgent: 0, important: 1, normal: 2 }
