import { describe, expect, it } from 'vitest'

import { buildTown, tileChar } from '../src/game/town.ts'

// #255: the generated producer emits the same Zone primitive the authored
// producer carries — the tall-grass field as one level-triggered encounter
// zone, the gate trainer as an on_sight zone — with payloads from policy.
describe('buildTown zones', () => {
  const town = buildTown(5)

  it('emits on_enter encounter zones covering exactly the grass (the avenue stays safe)', () => {
    const grass = town.zones.filter((z) => z.payload.kind === 'encounter')
    expect(grass.length).toBeGreaterThan(0)
    for (const z of grass) expect(z.trigger).toBe('on_enter')
    for (let y = 0; y < town.rows; y++)
      for (let x = 0; x < town.cols; x++) {
        const inside = grass.some(
          (z) => x >= z.x && x < z.x + (z.w ?? 1) && y >= z.y && y < z.y + (z.h ?? 1),
        )
        expect(inside).toBe(tileChar(town, x, y) === 'g')
      }
  })

  it('defaults the encounter pool to the global pool (empty slug)', () => {
    for (const z of town.zones.filter((zz) => zz.payload.kind === 'encounter'))
      expect(z.payload).toEqual({ kind: 'encounter', pool: '' })
  })

  it('names the pool the policy carries', () => {
    const pooled = buildTown(5, undefined, undefined, undefined, undefined, {
      tree: null,
      flowerGroup: null,
      flowerSingle: null,
      wildPool: 'plaza-rares',
    })
    const z = pooled.zones.find((zz) => zz.payload.kind === 'encounter')
    expect(z?.payload).toEqual({ kind: 'encounter', pool: 'plaza-rares' })
  })

  it('emits no gate trainer — the entrance is unguarded', () => {
    expect(town.zones.filter((z) => z.payload.kind === 'trainer')).toHaveLength(0)
  })

  it('places no signpost tile anywhere', () => {
    for (let y = 0; y < town.rows; y++)
      for (let x = 0; x < town.cols; x++) expect(tileChar(town, x, y)).not.toBe('s')
  })
})
