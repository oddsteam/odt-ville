// Shared player-movement primitives for TownScene + InteriorScene. The scenes
// each have their own walkability rule and their own arrival interactions, but
// the input-resolution loop and the tile-step + tween cycle are identical — so
// they live here once.
//
// The module has no Phaser dependency beyond the `tweens.add` shape: a scene
// is passed in as `SceneLike`, which a fake-scene test can fulfil with a plain
// object. Scene-specific concerns (door entry, trainer sight, depth sort, walk
// animation) plug in through the `walkable`, `onStart`, `onBlocked`, and
// `onArrive` callbacks.

export type Direction = 'up' | 'down' | 'left' | 'right'

interface KeyState {
  isDown: boolean
}

interface DirectionalKeys {
  up: KeyState
  down: KeyState
  left: KeyState
  right: KeyState
}

export interface DirectionInput {
  dpadDir: Direction | null
  cursors: DirectionalKeys
  wasd: DirectionalKeys
}

// Resolve which direction the player is currently holding. The overlay D-pad
// wins over keyboard (a tap on touch is mutually exclusive with held keys on
// the same device); among keys, fixed up/down/left/right priority matches the
// pre-extraction behaviour of both scenes.
export function resolveDirection({ dpadDir, cursors, wasd }: DirectionInput): Direction | null {
  if (dpadDir) return dpadDir
  if (cursors.up.isDown || wasd.up.isDown) return 'up'
  if (cursors.down.isDown || wasd.down.isDown) return 'down'
  if (cursors.left.isDown || wasd.left.isDown) return 'left'
  if (cursors.right.isDown || wasd.right.isDown) return 'right'
  return null
}

export interface Tile {
  x: number
  y: number
}

export function deltaFor(dir: Direction): { dx: number; dy: number } {
  return {
    dx: dir === 'left' ? -1 : dir === 'right' ? 1 : 0,
    dy: dir === 'up' ? -1 : dir === 'down' ? 1 : 0,
  }
}

interface TweenConfig {
  targets: unknown
  x: number
  y: number
  duration: number
  onComplete: () => void
}

interface TweenManager {
  add(config: TweenConfig): unknown
}

interface SceneLike {
  tweens: TweenManager
}

export interface StepConfig {
  scene: SceneLike
  // The sprite (or whatever the tween should target — both scenes pass the
  // player sprite).
  target: unknown
  from: Tile
  dir: Direction
  // Walkability rule for the destination tile. Scenes inject their own — town
  // checks buildings + props + trainer; interior checks walls + boards.
  walkable: (x: number, y: number) => boolean
  // Tile → world-space (px) translation, so the module never has to know
  // about TILE size or the rpg-char-01 feet-lift quirk.
  toWorldXY: (tile: Tile) => { x: number; y: number }
  // The step decided to move. Scene updates depth, plays the walk animation,
  // and assigns the returned tween to its movingTween slot.
  onStart?: (tile: Tile) => void
  // Walkable rejected the destination — scene resets to the still pose.
  onBlocked?: () => void
  // Tween finished — scene clears movingTween, snaps to still if no direction
  // is held, and runs its own arrival interactions (door, trainer, wild).
  onArrive?: (tile: Tile) => void
  duration: number
}

export interface StepResult {
  newTile: Tile | null
  tween: unknown | null
  blocked: boolean
}

export function stepTile(cfg: StepConfig): StepResult {
  const { dx, dy } = deltaFor(cfg.dir)
  const target: Tile = { x: cfg.from.x + dx, y: cfg.from.y + dy }
  if (!cfg.walkable(target.x, target.y)) {
    cfg.onBlocked?.()
    return { newTile: null, tween: null, blocked: true }
  }
  cfg.onStart?.(target)
  const dest = cfg.toWorldXY(target)
  const tween = cfg.scene.tweens.add({
    targets: cfg.target,
    x: dest.x,
    y: dest.y,
    duration: cfg.duration,
    onComplete: () => cfg.onArrive?.(target),
  })
  return { newTile: target, tween, blocked: false }
}
