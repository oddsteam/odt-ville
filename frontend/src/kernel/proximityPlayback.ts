// Proximity playback (#438, ADR-0019). `playback: 'loop'` lets the clock drive
// an animated object's playhead; `'proximity'` lets the *avatar's distance*
// drive it — forward while they are near, reverse once they leave, held at
// either end. That one catalog field is the whole difference between a riffling
// spell book and a door that swings open as you walk up to it.
//
// The decision is pure arithmetic over tiles, so it lives here rather than in
// the Phaser stamp: producers and tests can ask which way a door is swinging
// without booting a scene (same convention as the rest of the kernel).
//
// The door is decorative. Nothing here touches walkability — its cell stays
// walkable at every frame, exactly like any other Prop's.

export interface Tile {
  x: number
  y: number
}

// How close the avatar must be, in tiles, for a proximity object to open.
// Two tiles: far enough that a 1×2 door is already swinging by the time you
// reach it (the producers anchor a footprint differently — top-left on an
// authored map, bottom on the town — so the measured tile can sit a tile off),
// close enough that a distant passer-by leaves it shut.
export const PROXIMITY_RANGE_TILES = 2

// Which way the playhead should run this frame: +1 opening, -1 closing.
// Distance is Chebyshev — a square region around the object, which is both
// cheaper than a hypotenuse and kinder to a door approached on the diagonal.
export function swingDirection(avatar: Tile, object: Tile, range = PROXIMITY_RANGE_TILES): 1 | -1 {
  const away = Math.max(Math.abs(avatar.x - object.x), Math.abs(avatar.y - object.y))
  return away <= range ? 1 : -1
}

// Move a playhead — a float frame index — one frame's worth in `direction`,
// clamped to [0, frameCount - 1]. The clamp is what makes it hold shut and hold
// open instead of looping, and starting from the *current* playhead is what
// makes a reversal continue from where the swing got to rather than snapping.
export function advancePlayhead(
  playhead: number,
  direction: 1 | -1,
  { fps, frameCount, deltaMs }: { fps: number; frameCount: number; deltaMs: number },
): number {
  const next = playhead + (direction * fps * deltaMs) / 1000
  return Math.min(Math.max(next, 0), frameCount - 1)
}
