import { describe, it, expect } from 'vitest'
import { normalizeManifest, resolveSheetSrc } from './characterManifest.js'

// A Look (ADR-0017) carries parts + a packed layout instead of a sheet. The rig
// reads manifest.postures/frameRate unchanged, so normalize must surface those
// from the layout while keeping parts + layout on the blob for the bake.
const look = {
  version: 1,
  name: 'seed-look',
  parts: ['body-01', 'eyes-01'],
  layout: {
    name: 'modern-interiors',
    atlas: { width: 256, height: 256 },
    grid: { frameWidth: 32, frameHeight: 64 },
    render: { originX: 0.5, originY: 1, scale: 1 },
    frameRate: 9,
    postures: { idleDown: [{ x: 0, y: 0, w: 32, h: 64 }] },
  },
}

describe('normalizeManifest — Look', () => {
  it('keeps parts + layout on the blob', () => {
    const m = normalizeManifest(look)
    expect(m.parts).toEqual(['body-01', 'eyes-01'])
    expect(m.layout).toEqual(look.layout)
  })

  it('surfaces the layout postures/frameRate the rig slices', () => {
    const m = normalizeManifest(look)
    expect(m.postures.idleDown).toEqual([{ x: 0, y: 0, w: 32, h: 64 }])
    expect(m.frameRate).toBe(9)
  })

  it('has no sheet src, so preload takes the bake path not the image path', () => {
    expect(resolveSheetSrc(normalizeManifest(look))).toBe('')
  })
})

describe('normalizeManifest — sheet manifest still works', () => {
  const sheet = {
    version: 1,
    name: 'scout',
    sheet: { path: '/maps/characters/sheets/scout.png', width: 1854, height: 1312 },
    frameRate: 9,
    postures: { idleDown: [{ x: 96, y: 0, w: 32, h: 64 }] },
  }
  it('keeps the sheet src and postures untouched', () => {
    const m = normalizeManifest(sheet)
    expect(resolveSheetSrc(m)).toBe('/maps/characters/sheets/scout.png')
    expect(m.postures.idleDown).toEqual([{ x: 96, y: 0, w: 32, h: 64 }])
    expect(m.parts).toBeUndefined()
  })
})
