// The world-wide Standees budget (#371, ADR-0015): a user may have at most 3
// Standees out at once, counted across *every* map. This mirrors the backend
// `Standees::Budget` arithmetic so the deploy affordance can show "N of 3 out"
// and refuse — with a located pointer — before the employee writes anything.

import { describe, expect, it } from 'vitest'
import { STANDEE_CAP, standeeBudget } from './budget.ts'

const at = (map_title: string, x: number, y: number) => ({ map_title, x, y })

describe('standeeBudget', () => {
  it('with none out allows a deploy and reports the full budget', () => {
    const b = standeeBudget([])
    expect(b.out).toBe(0)
    expect(b.remaining).toBe(STANDEE_CAP)
    expect(b.allowed).toBe(true)
    expect(b.reason).toBeNull()
  })

  it('below the cap still allows, counting the remaining down', () => {
    const b = standeeBudget([at('Plaza', 3, 5), at('Grove', 2, 2)])
    expect(b.out).toBe(2)
    expect(b.remaining).toBe(1)
    expect(b.allowed).toBe(true)
    expect(b.reason).toBeNull()
  })

  it('at the cap refuses with a pointer naming where each Standee is', () => {
    const b = standeeBudget([at('Plaza', 3, 5), at('Grove', 2, 2), at('Plaza', 1, 1)])
    expect(b.out).toBe(3)
    expect(b.remaining).toBe(0)
    expect(b.allowed).toBe(false)
    expect(b.reason).toContain('Plaza (3, 5)')
    expect(b.reason).toContain('Grove (2, 2)')
    expect(b.reason).toContain('Plaza (1, 1)')
  })

  it('counts across maps — three on three maps is still the cap', () => {
    const b = standeeBudget([at('A', 0, 0), at('B', 0, 0), at('C', 0, 0)])
    expect(b.allowed).toBe(false)
    expect(b.remaining).toBe(0)
  })
})
