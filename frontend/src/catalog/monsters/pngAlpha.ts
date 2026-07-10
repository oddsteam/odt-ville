// PNG transparency check for the monster upload form. A flat-RGB PNG (no alpha
// channel) bakes a checkerboard background into the encounter overlay, so the
// admin form warns when one is picked. We read the IHDR color-type byte, which
// sits at a fixed offset in the decoded bytes: 8-byte signature + 4-byte length
// + 4-byte "IHDR" + width(4) + height(4) + bit-depth(1) = byte 25. Color types
// 4 (gray+alpha) and 6 (truecolor+alpha) carry alpha; 0/2/3 (gray/RGB/palette)
// do not.
const COLOR_TYPE_OFFSET = 25
const ALPHA_COLOR_TYPES = new Set([4, 6])

// True if the PNG data URL declares an alpha channel. Non-PNG or unparseable
// input returns true so the form never false-warns on something it can't read —
// the warning is advisory, not a gate.
export function pngHasAlpha(dataUrl: string): boolean {
  try {
    const bytes = atob(dataUrl.split(',')[1] ?? '')
    const isPng = bytes.charCodeAt(0) === 0x89 && bytes.slice(1, 4) === 'PNG'
    return isPng ? ALPHA_COLOR_TYPES.has(bytes.charCodeAt(COLOR_TYPE_OFFSET)) : true
  } catch {
    return true
  }
}
