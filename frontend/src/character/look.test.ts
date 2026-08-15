// buildLookData assembles the Look's data blob (#398, ADR-0017): the parts in
// fixed z-order (body → eyes → outfit → hairstyle → accessory), empties
// dropped, at most two accessories, plus the pack layout. The server re-checks
// the slot rules — this only keeps the ugly form from sending garbage.

import { describe, expect, it } from 'vitest'
import { buildLookData, selectionFromParts, toggleAccessory } from './look.ts'

const LAYOUT = { name: 'modern-interiors', atlas: { width: 256, height: 256 } }

describe('buildLookData', () => {
  it('orders parts by slot and drops empty optionals', () => {
    const data = buildLookData(
      { body: 'body-01', eyes: 'eyes-01', outfit: '', hairstyle: 'hairstyle-01-01', accessory: ['', ''] },
      LAYOUT,
    )
    expect(data).toEqual({
      parts: ['body-01', 'eyes-01', 'hairstyle-01-01'],
      layout: LAYOUT,
    })
  })

  it('keeps up to two accessories in order', () => {
    const data = buildLookData(
      { body: 'body-01', eyes: 'eyes-01', outfit: 'outfit-01-01', hairstyle: '', accessory: ['accessory-01-01', 'accessory-02-01'] },
      LAYOUT,
    )
    expect(data.parts).toEqual(['body-01', 'eyes-01', 'outfit-01-01', 'accessory-01-01', 'accessory-02-01'])
  })
})

describe('selectionFromParts (seed the builder from a saved Look)', () => {
  it('routes each part to its slot, collecting up to two accessories', () => {
    const sel = selectionFromParts(['body-03', 'eyes-02', 'hairstyle-07-03', 'accessory-15-01', 'accessory-02-01'])
    expect(sel).toEqual({
      body: 'body-03',
      eyes: 'eyes-02',
      outfit: '',
      hairstyle: 'hairstyle-07-03',
      accessory: ['accessory-15-01', 'accessory-02-01'],
    })
  })

  it('ignores parts past the accessory cap and unknown slots', () => {
    const sel = selectionFromParts(['body-01', 'accessory-01-01', 'accessory-02-01', 'accessory-03-01', 'premade-05'])
    expect(sel.accessory).toEqual(['accessory-01-01', 'accessory-02-01'])
  })
})

describe('toggleAccessory (cap of two, FIFO)', () => {
  it('adds when absent, removes when present', () => {
    expect(toggleAccessory([], 'accessory-01-01')).toEqual(['accessory-01-01'])
    expect(toggleAccessory(['accessory-01-01'], 'accessory-01-01')).toEqual([])
  })

  it('drops the oldest when a third is added', () => {
    expect(toggleAccessory(['accessory-01-01', 'accessory-02-01'], 'accessory-03-01')).toEqual([
      'accessory-02-01',
      'accessory-03-01',
    ])
  })
})
