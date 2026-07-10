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
export { PER_ROW, buildTown, tileChar, isGroundWalkable } from './town.ts'

export { TILE } from '../kernel/constants.ts' // rendered px per tile — kernel-owned scale
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
