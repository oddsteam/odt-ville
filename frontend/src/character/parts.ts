// The pack's two-level Part structure (#399, CONTEXT.md → Part style / variant):
// 469 Parts are only 83 styles. Pure name-parsing so the picker shows a style
// grid then a variant row, never one flat 200-item list. No I/O — the names
// come from parts.json (fetched at runtime).

export type Slot = 'body' | 'eyes' | 'outfit' | 'hairstyle' | 'accessory'

// The fixed, ordered Part slots (painting order body → … → accessory). `max` is
// how many a Look may wear: one each, except accessory (glasses + hat compose).
export const SLOTS = [
  { key: 'body', label: 'Body', required: true, max: 1 },
  { key: 'eyes', label: 'Eyes', required: true, max: 1 },
  { key: 'outfit', label: 'Outfit', required: false, max: 1 },
  { key: 'hairstyle', label: 'Hairstyle', required: false, max: 1 },
  { key: 'accessory', label: 'Accessory', required: false, max: 2 },
] as const satisfies readonly { key: Slot; label: string; required: boolean; max: number }[]

const SLOT_KEYS = SLOTS.map((s) => s.key)

export type Style = { style: string; parts: string[] }
export type Catalog = Record<Slot, Style[]>

// `<slot>` from a Part name (`hairstyle-12-04` → `hairstyle`, `body-01` → `body`).
export function partSlot(name: string): string {
  return name.slice(0, name.indexOf('-'))
}

// `<style>` from a Part name — the middle number for multi-style slots
// (`hairstyle-12-04` → `12`), '' for body/eyes which have no style segment.
export function partStyle(name: string): string {
  const parts = name.split('-')
  return parts.length === 3 ? parts[1] : ''
}

// Group flat Part names into slot → styles → variants. body/eyes carry no style
// segment (`body-01`), so they collapse to one style; the rest key on the middle
// number (`hairstyle-12-04` → style '12'). Styles and variants come out numeric.
export function groupParts(names: readonly string[]): Catalog {
  const cat: Catalog = { body: [], eyes: [], outfit: [], hairstyle: [], accessory: [] }
  const styleOf = new Map<string, Style>()
  for (const name of [...names].sort()) {
    const [slot, a, b] = name.split('-')
    if (!SLOT_KEYS.includes(slot as Slot)) continue
    const style = b === undefined ? '' : a
    const key = `${slot}-${style}`
    let group = styleOf.get(key)
    if (!group) {
      group = { style, parts: [] }
      styleOf.set(key, group)
      cat[slot as Slot].push(group)
    }
    group.parts.push(name)
  }
  return cat
}
