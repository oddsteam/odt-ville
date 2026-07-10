import { describe, expect, it } from 'vitest'
import { pngHasAlpha } from '../src/catalog/monsters/pngAlpha.ts'

// Build a minimal PNG data URL whose IHDR color-type byte (offset 25 in the
// decoded bytes) is `colorType`. Only the signature + that byte are read.
function pngDataUrl(colorType: number): string {
  const bytes = new Uint8Array(26)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG signature
  bytes.set([73, 72, 68, 82], 12) // "IHDR"
  bytes[25] = colorType
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
}

describe('pngHasAlpha (IHDR color-type byte)', () => {
  it('reports an alpha channel for truecolor+alpha (6) and grayscale+alpha (4)', () => {
    expect(pngHasAlpha(pngDataUrl(6))).toBe(true)
    expect(pngHasAlpha(pngDataUrl(4))).toBe(true)
  })

  it('reports no alpha for grayscale (0), RGB (2), and palette (3)', () => {
    expect(pngHasAlpha(pngDataUrl(0))).toBe(false)
    expect(pngHasAlpha(pngDataUrl(2))).toBe(false)
    expect(pngHasAlpha(pngDataUrl(3))).toBe(false)
  })

  it('returns a safe default (no warning) for non-PNG or unreadable input', () => {
    expect(pngHasAlpha('data:image/jpeg;base64,/9j/4AAQ')).toBe(true)
    expect(pngHasAlpha('not a data url')).toBe(true)
    expect(pngHasAlpha('')).toBe(true)
  })
})
