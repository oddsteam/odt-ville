// ODT Ville — top-down, Pokémon Game Boy-style town.
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

// Vertical offset added to the player sprite's foot position, in
// screen pixels. Phaser's +y points down, so a positive value pushes
// the feet BELOW the tile's bottom edge — useful when the sprite
// (rpg-char-01) has transparent padding under its visible feet and
// "feet exactly on the tile floor" looks too high. Negative values
// lift the feet above the tile floor. Both TownScene and InteriorScene
// read this so the player sits at the same height-relative-to-tile in
// either scene.
export const PLAYER_FEET_LIFT = 27

// Player walk sprites, keyed by facing direction: [still, step-A, mid, step-B].
export const SPRITES = {
  down: [frontStill, frontWalk1, frontWalk2, frontWalk3],
  up: [backStill, backWalk1, backWalk2, backWalk3],
  left: [leftStill, leftWalk1, leftWalk2, leftWalk3],
  right: [rightStill, rightWalk1, rightWalk2, rightWalk3],
}

// ---- Town layout (generated at runtime from the community count) --------
// There is no house cap: the town is rebuilt for however many communities
// exist. Buildings fill PER_ROW per street row, then wrap onto a new row,
// so the town grows downward endlessly. Admins never place buildings — they
// just drop onto the next slot in position_order.
export const PER_ROW = 5 // buildings per street row
const BAND_H = 7 // per row band: 4 building + 1 street-path + 2 grass gap
const TOP_MARGIN = 2 // grass rows above the first building row
const BOTTOM_MARGIN = 2 // grass rows below the last street, before the gate
const FIELD_GAP = 1 // grass row between the last street row and the field
const FIELD_H = 5 // height of the tall-grass field block (wild encounters)

// Build the whole town for a given number of building plots. Returns a `town`
// object: { cols, rows, map (string[]), plots, entrance }.
export function buildTown(plotCount) {
  const count = Math.max(plotCount, 1)
  const numRows = Math.ceil(count / PER_ROW)
  const colsUsed = Math.max(Math.min(count, PER_ROW), 3)
  const cols = 4 * colsUsed + 4
  const rows =
    1 + TOP_MARGIN + numRows * BAND_H + FIELD_GAP + FIELD_H + BOTTOM_MARGIN + 1

  // Each plot: 3 wide x 4 tall; door is the bottom-centre tile.
  // The first plots (by position_order) sit on the bottom-most building row —
  // closest to the entrance — and each new row extends the town *upward*, so
  // existing buildings stay anchored where they were as the town grows.
  const plots = []
  for (let i = 0; i < count; i++) {
    const slot = i % PER_ROW
    const r = Math.floor(i / PER_ROW)
    const col = 2 + slot * 4
    const row = 1 + TOP_MARGIN + (numRows - 1 - r) * BAND_H
    plots.push({ col, row, w: 3, h: 4, doorCol: col + 1, doorRow: row + 3 })
  }

  const streetPathRows = new Set()
  const buildingRows = new Set()
  for (let r = 0; r < numRows; r++) {
    const top = 1 + TOP_MARGIN + r * BAND_H
    streetPathRows.add(top + 4)
    for (let k = 0; k < 4; k++) buildingRows.add(top + k)
  }
  const lastStreetPath = 1 + TOP_MARGIN + (numRows - 1) * BAND_H + 4
  const entranceCol = Math.floor(cols / 2)

  // Tall-grass field — a reserved patch inside the town where wild Pokémon are
  // encountered. The entrance stem cuts a safe (no-encounter) path through it.
  const fieldTop = 1 + TOP_MARGIN + numRows * BAND_H + FIELD_GAP
  const fieldBottom = fieldTop + FIELD_H - 1
  const fieldLeft = 3
  const fieldRight = cols - 4

  // Ground tile for (x,y): T tree / s sign (blocked) · . grass / : path /
  // g tall grass (all walkable; g rolls for wild encounters).
  function tileFor(x, y) {
    if (y === 0) return 'T'
    if (y === rows - 1) return x === entranceCol ? ':' : 'T' // gate
    if (x === 0 || x === cols - 1) return 'T'
    if (streetPathRows.has(y)) return ':' // street under each building row
    if (x === 1) return ':' // side avenue linking the streets
    if (x === entranceCol && y >= lastStreetPath) return ':' // entrance stem
    if (y >= fieldTop && y <= fieldBottom && x >= fieldLeft && x <= fieldRight)
      return 'g' // tall-grass field
    if (y === rows - 2 && x === entranceCol - 1) return 's' // signpost
    if (!buildingRows.has(y) && (x * 5 + y * 3) % 11 === 0) return '*' // flowers
    return '.'
  }

  const map = []
  for (let y = 0; y < rows; y++) {
    let row = ''
    for (let x = 0; x < cols; x++) row += tileFor(x, y)
    map.push(row)
  }

  return { cols, rows, map, plots, entrance: { x: entranceCol, y: rows - 2 } }
}

const WALKABLE = new Set(['.', ':', '*', 'g'])

export function tileChar(town, x, y) {
  if (y < 0 || y >= town.rows || x < 0 || x >= town.cols) return 'T'
  return town.map[y][x]
}

// Ground-layer walkability (callers add building collision on top).
export function isGroundWalkable(town, x, y) {
  return WALKABLE.has(tileChar(town, x, y))
}

// Category emoji map used by the game's nameplate / admin row. The communities
// module keeps its own copy of this mapping so the game/communities boundary
// stays clean (game does not import from communities or vice-versa).
const CATEGORY_EMOJI = {
  compliance: '⚖️',
  product: '📦',
  branch_ops: '🏢',
  learning: '🎓',
  community: '☕',
}

export function categoryEmoji(key) {
  return CATEGORY_EMOJI[key] || '🏠'
}
