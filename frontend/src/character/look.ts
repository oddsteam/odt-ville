// A Look's data blob (#398, ADR-0017): a recipe, not a sheet. The five Part
// slots in fixed z-order plus the pack's Sheet layout — the exact shape
// characterRig bakes and the backend slot-validates. Pure; no React, no I/O.

export type LookSelection = {
  body: string
  eyes: string
  outfit: string
  hairstyle: string
  accessory: readonly string[]
}

// Flatten the selection into the ordered parts array, dropping empty optionals
// and capping accessories at two. Body/eyes may still be empty here — the form
// requires them and the server rejects a Look without them.
export function buildLookData(selection: LookSelection, layout: unknown) {
  const parts = [
    selection.body,
    selection.eyes,
    selection.outfit,
    selection.hairstyle,
    ...selection.accessory.slice(0, 2),
  ].filter(Boolean)
  return { parts, layout }
}
