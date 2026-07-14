// The one owner of the walk-mask character alphabet (#172). Every walk mask —
// a building footprint (#32), an authored map's placed entity (#131) — is
// row-major chars sharing this vocabulary: '#' solid, '.'/'o'/'L' walkable.
// Town and authored-map paths both read it through here, so the convention is
// defined once.

import { describe, expect, it } from 'vitest'
import { maskCharWalkable, maskCharSolid, maskCharLadder } from './walkMask.ts'

describe('maskCharWalkable', () => {
  it('walks the porch/overhang/ladder chars, blocks the rest', () => {
    expect(maskCharWalkable('.')).toBe(true) // porch (avatar over the art)
    expect(maskCharWalkable('o')).toBe(true) // overhang (#44, avatar under)
    expect(maskCharWalkable('L')).toBe(true) // ladder (#54)
    expect(maskCharWalkable('#')).toBe(false) // solid
    // Default-solid: an unknown or missing cell is not walkable, so a building
    // footprint stays a solid box wherever the mask doesn't carve a hole.
    expect(maskCharWalkable(' ')).toBe(false)
    expect(maskCharWalkable(undefined)).toBe(false)
  })
})

describe('maskCharSolid', () => {
  it('marks only the explicit # as solid, everything else passable', () => {
    expect(maskCharSolid('#')).toBe(true)
    // Default-passable: a placed entity blocks only the cells it paints '#',
    // so any other (or missing) char contributes no collision.
    expect(maskCharSolid('.')).toBe(false)
    expect(maskCharSolid('o')).toBe(false)
    expect(maskCharSolid(undefined)).toBe(false)
  })
})

describe('maskCharLadder', () => {
  it('marks only the explicit L as a ladder, everything else not', () => {
    expect(maskCharLadder('L')).toBe(true)
    // A ladder is walkable but distinct from a plain porch: only 'L' drives the
    // climb posture, so no other walkable char reads as one.
    expect(maskCharLadder('.')).toBe(false)
    expect(maskCharLadder('o')).toBe(false)
    expect(maskCharLadder('#')).toBe(false)
    expect(maskCharLadder(undefined)).toBe(false)
  })
})
