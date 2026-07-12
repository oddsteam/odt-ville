import { describe, expect, it } from 'vitest'
import { movedOrder } from './priorityMove.ts'

// The stack is low→high priority; +1 raises a terrain (owns more seams).
describe('movedOrder', () => {
  it('swaps a terrain with its higher neighbour on +1', () => {
    expect(movedOrder(['road', 'dirt', 'grass'], 'dirt', 1)).toEqual(['road', 'grass', 'dirt'])
  })

  it('swaps a terrain with its lower neighbour on -1', () => {
    expect(movedOrder(['road', 'dirt', 'grass'], 'dirt', -1)).toEqual(['dirt', 'road', 'grass'])
  })

  it('returns null when the move falls off either end or the name is unknown', () => {
    expect(movedOrder(['road', 'dirt', 'grass'], 'grass', 1)).toBeNull()
    expect(movedOrder(['road', 'dirt', 'grass'], 'road', -1)).toBeNull()
    expect(movedOrder(['road', 'dirt', 'grass'], 'water', 1)).toBeNull()
  })
})
