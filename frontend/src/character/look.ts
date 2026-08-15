// A Look's data blob (#398, ADR-0017): a recipe, not a sheet. The five Part
// slots in fixed z-order plus the pack's Sheet layout — the exact shape
// characterRig bakes and the backend slot-validates. Pure; no React, no I/O.

import { partSlot } from './parts.ts'

export type LookSelection = {
  body: string
  eyes: string
  outfit: string
  hairstyle: string
  accessory: readonly string[]
}

export const MAX_ACCESSORIES = 2

// The selection flattened into the fixed z-order (body → eyes → outfit →
// hairstyle → accessory), empties dropped, accessories capped. This ordering is
// what composeLook paints and what the builder previews.
export function orderedParts(selection: LookSelection): string[] {
  return [
    selection.body,
    selection.eyes,
    selection.outfit,
    selection.hairstyle,
    ...selection.accessory.slice(0, MAX_ACCESSORIES),
  ].filter(Boolean)
}

// Flatten the selection into the Look's data blob. Body/eyes may still be empty
// here — the form requires them and the server rejects a Look without them.
export function buildLookData(selection: LookSelection, layout: unknown) {
  return { parts: orderedParts(selection), layout }
}

// Seed the builder from a saved Look's flat parts (#399): route each part to its
// slot, collecting up to two accessories and ignoring anything unrecognised (a
// premade sheet has no parts, so it seeds an empty selection → default body).
export function selectionFromParts(parts: readonly string[]): LookSelection {
  const single = { body: '', eyes: '', outfit: '', hairstyle: '' }
  const accessory: string[] = []
  for (const name of parts) {
    const slot = partSlot(name)
    if (slot === 'accessory') {
      if (accessory.length < MAX_ACCESSORIES) accessory.push(name)
    } else if (slot in single) {
      single[slot as keyof typeof single] = name
    }
  }
  return { ...single, accessory }
}

// Toggle an accessory in/out of the worn set (#399): remove if present, else add
// — dropping the oldest when the cap of two is already reached (FIFO), so a
// click always changes something.
export function toggleAccessory(list: readonly string[], name: string): string[] {
  if (list.includes(name)) return list.filter((n) => n !== name)
  return [...list, name].slice(-MAX_ACCESSORIES)
}
