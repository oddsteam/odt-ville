import { describe, expect, it, vi } from 'vitest'

import {
  deltaFor,
  resolveDirection,
  stepTile,
  type Direction,
} from '../src/game/phaser/movement.ts'

const key = (isDown: boolean) => ({ isDown })

const dirs = () => ({
  up: key(false),
  down: key(false),
  left: key(false),
  right: key(false),
})

describe('resolveDirection', () => {
  it('returns null when no input is held', () => {
    expect(resolveDirection({ dpadDir: null, cursors: dirs(), wasd: dirs() })).toBeNull()
  })

  it('returns the keyboard direction when held', () => {
    const cursors = { ...dirs(), down: key(true) }
    expect(resolveDirection({ dpadDir: null, cursors, wasd: dirs() })).toBe('down')
  })

  it('treats WASD identically to cursor keys', () => {
    const wasd = { ...dirs(), right: key(true) }
    expect(resolveDirection({ dpadDir: null, cursors: dirs(), wasd })).toBe('right')
  })

  it('prefers the D-pad over the keyboard so taps win over a held key', () => {
    const cursors = { ...dirs(), up: key(true) }
    expect(resolveDirection({ dpadDir: 'left', cursors, wasd: dirs() })).toBe('left')
  })

  it('resolves multi-key holds with up > down > left > right precedence', () => {
    const cursors = { up: key(true), down: key(true), left: key(true), right: key(true) }
    expect(resolveDirection({ dpadDir: null, cursors, wasd: dirs() })).toBe('up')
    expect(
      resolveDirection({
        dpadDir: null,
        cursors: { ...dirs(), down: key(true), left: key(true) },
        wasd: dirs(),
      }),
    ).toBe('down')
    expect(
      resolveDirection({
        dpadDir: null,
        cursors: { ...dirs(), left: key(true), right: key(true) },
        wasd: dirs(),
      }),
    ).toBe('left')
  })
})

describe('deltaFor', () => {
  it('maps directions to unit tile offsets', () => {
    expect(deltaFor('up')).toEqual({ dx: 0, dy: -1 })
    expect(deltaFor('down')).toEqual({ dx: 0, dy: 1 })
    expect(deltaFor('left')).toEqual({ dx: -1, dy: 0 })
    expect(deltaFor('right')).toEqual({ dx: 1, dy: 0 })
  })
})

// Minimal fake Phaser tween manager — captures the config and lets the test
// drive the onComplete to simulate arrival.
function fakeScene() {
  const added: any[] = []
  const tween = (config: any) => {
    const t = { config, fire: () => config.onComplete?.() }
    added.push(t)
    return t
  }
  return {
    scene: { tweens: { add: tween } },
    added,
  }
}

describe('stepTile', () => {
  const baseCfg = () => ({
    from: { x: 5, y: 5 },
    dir: 'right' as Direction,
    toWorldXY: (t: { x: number; y: number }) => ({ x: t.x * 10, y: t.y * 10 }),
    duration: 100,
    target: {},
  })

  it('does not move when walkable() rejects the destination tile', () => {
    const { scene, added } = fakeScene()
    const walkable = vi.fn(() => false)
    const onStart = vi.fn()
    const onBlocked = vi.fn()
    const onArrive = vi.fn()

    const result = stepTile({
      ...baseCfg(),
      scene,
      walkable,
      onStart,
      onBlocked,
      onArrive,
    })

    expect(walkable).toHaveBeenCalledWith(6, 5)
    expect(result.blocked).toBe(true)
    expect(result.newTile).toBeNull()
    expect(result.tween).toBeNull()
    expect(added).toHaveLength(0)
    expect(onBlocked).toHaveBeenCalledOnce()
    expect(onStart).not.toHaveBeenCalled()
    expect(onArrive).not.toHaveBeenCalled()
  })

  it('moves to the destination tile when walkable() allows it', () => {
    const { scene, added } = fakeScene()
    const walkable = vi.fn(() => true)
    const onStart = vi.fn()
    const onBlocked = vi.fn()
    const onArrive = vi.fn()

    const result = stepTile({
      ...baseCfg(),
      scene,
      walkable,
      onStart,
      onBlocked,
      onArrive,
    })

    expect(result.blocked).toBe(false)
    expect(result.newTile).toEqual({ x: 6, y: 5 })
    expect(result.tween).toBe(added[0])
    expect(added).toHaveLength(1)
    expect(added[0].config.x).toBe(60)
    expect(added[0].config.y).toBe(50)
    expect(added[0].config.duration).toBe(100)
    expect(onStart).toHaveBeenCalledWith({ x: 6, y: 5 })
    expect(onBlocked).not.toHaveBeenCalled()
    expect(onArrive).not.toHaveBeenCalled()
  })

  it('does not move when transitionBlocked rejects the from→to edge, even if walkable', () => {
    const { scene, added } = fakeScene()
    const transitionBlocked = vi.fn(() => true)
    const onBlocked = vi.fn()

    const result = stepTile({
      ...baseCfg(),
      scene,
      walkable: () => true,
      transitionBlocked,
      onBlocked,
    })

    expect(transitionBlocked).toHaveBeenCalledWith({ x: 5, y: 5 }, { x: 6, y: 5 })
    expect(result.blocked).toBe(true)
    expect(added).toHaveLength(0)
    expect(onBlocked).toHaveBeenCalledOnce()
  })

  it('invokes onArrive with the destination tile when the tween completes', () => {
    const { scene, added } = fakeScene()
    const onArrive = vi.fn()

    stepTile({
      ...baseCfg(),
      dir: 'up',
      from: { x: 2, y: 4 },
      scene,
      walkable: () => true,
      onArrive,
    })

    expect(onArrive).not.toHaveBeenCalled()
    added[0].fire()
    expect(onArrive).toHaveBeenCalledWith({ x: 2, y: 3 })
  })
})
