// Interior room geometry for a community house. The game module is a black
// box — it doesn't know what *content* lives behind a board, only that there
// is a board you can walk up to and "press A on". The shell decides what to
// do with the board id (open the content list, or — for the demo — an
// external URL).

// The three boards, in left-to-right order along the back wall. These are
// stable string identifiers that flow back to the shell via onOpenBoard.
export const BOARD_TYPES = ['must_know', 'should_know', 'nice_to_know']

// Display labels shown above each board in the room.
export const BOARD_LABELS = {
  must_know: 'MUST KNOW',
  should_know: 'SHOULD KNOW',
  nice_to_know: 'NICE TO KNOW',
}

// Single fixed-size room for now (Phase 0). Big enough to feel like a room
// you walk around in, small enough that the boards are always 2-3 steps away.
const ROOM_COLS = 11
const ROOM_ROWS = 8
const BOARD_COLS = [3, 5, 7] // spread evenly across the back wall
const BOARD_ROW = 1 // hung against the top (north) wall
const DOOR_COL = 5 // centre of the bottom (south) wall
const DOOR_ROW = ROOM_ROWS - 1

// Build the interior tile map. The shape mirrors `town` from constants.js so
// the rendering / collision code reads the same way. Returns:
//   { cols, rows, map: string[], boards: [...], door: {x,y}, spawn: {x,y,facing} }
//
// Tile chars in `map`:
//   W — wall (blocked)
//   . — floor (walkable)
//   D — door (walkable; stepping onto it exits the room)
//   1 — Must Know board (blocked, interactable when adjacent + facing)
//   2 — Should Know board (blocked, interactable)
//   3 — Nice to Know board (blocked, interactable)
export function buildInterior() {
  const map = []
  for (let y = 0; y < ROOM_ROWS; y++) {
    let row = ''
    for (let x = 0; x < ROOM_COLS; x++) {
      const onBorder =
        y === 0 || y === ROOM_ROWS - 1 || x === 0 || x === ROOM_COLS - 1
      if (onBorder) {
        row += y === DOOR_ROW && x === DOOR_COL ? 'D' : 'W'
      } else if (y === BOARD_ROW) {
        const slot = BOARD_COLS.indexOf(x)
        row += slot >= 0 ? String(slot + 1) : '.'
      } else {
        row += '.'
      }
    }
    map.push(row)
  }

  const boards = BOARD_COLS.map((col, i) => ({
    col,
    row: BOARD_ROW,
    boardType: BOARD_TYPES[i],
    label: BOARD_LABELS[BOARD_TYPES[i]],
  }))

  return {
    cols: ROOM_COLS,
    rows: ROOM_ROWS,
    map,
    boards,
    door: { x: DOOR_COL, y: DOOR_ROW },
    // Player enters from the door; spawn one tile inside, facing into the room.
    spawn: { x: DOOR_COL, y: DOOR_ROW - 1, facing: 'up' },
  }
}

// Only floor and the door are walkable. Walls and boards block the player.
const WALKABLE = new Set(['.', 'D'])

export function interiorTileChar(interior, x, y) {
  if (y < 0 || y >= interior.rows || x < 0 || x >= interior.cols) return 'W'
  return interior.map[y][x]
}

export function isInteriorWalkable(interior, x, y) {
  return WALKABLE.has(interiorTileChar(interior, x, y))
}

// Returns the board sitting at (x, y), or null. Used both for collision
// (you can't walk through a board) and interaction (A presses the board you
// are facing).
export function boardAt(interior, x, y) {
  return interior.boards.find((b) => b.col === x && b.row === y) || null
}
