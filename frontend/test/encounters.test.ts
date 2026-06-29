import { describe, expect, it } from 'vitest'
import { pickFromPool, pickWild } from '../src/game/encounters.js'

// Authored pool rows mirror GET /api/v1/monsters/pool: { id, name, encounter_rate, image }.
const POOL = [
  { id: 1, name: 'Slime', encounter_rate: 1, image: 'data:slime' },
  { id: 2, name: 'Wolf', encounter_rate: 3, image: 'data:wolf' },
]

describe('pickFromPool (pure weighted pick, injected RNG)', () => {
  it('maps a pool row to a wild opponent with the image as its sprite and no level', () => {
    const pick = pickFromPool(POOL, () => 0)
    expect(pick).toEqual({ id: 1, name: 'Slime', sprite: 'data:slime', kind: 'wild' })
    expect('level' in pick).toBe(false)
  })

  it('weights the pick by encounter_rate via the injected RNG', () => {
    // total weight = 4. rng=0 lands in Slime's [0,1) band; rng=0.5 -> roll 2, in Wolf's [1,4) band.
    expect(pickFromPool(POOL, () => 0).name).toBe('Slime')
    expect(pickFromPool(POOL, () => 0.5).name).toBe('Wolf')
    expect(pickFromPool(POOL, () => 0.999).name).toBe('Wolf')
  })
})

describe('pickWild (authored pool, else hardcoded fallback)', () => {
  it('picks from the authored pool when it has weight', () => {
    expect(pickWild(POOL, () => 0).name).toBe('Slime')
  })

  it('falls back to a built-in encounter when the pool is empty', () => {
    const pick = pickWild([], () => 0) as { kind: string; level?: number }
    expect(pick.kind).toBe('wild')
    expect(pick.level).toBe(99) // built-ins carry a level; authored monsters do not
  })

  it('falls back when the pool has no positive weight (never divides by zero)', () => {
    const zero = [{ id: 9, name: 'Dud', encounter_rate: 0, image: 'data:dud' }]
    expect((pickWild(zero, () => 0) as { level?: number }).level).toBe(99)
  })
})
