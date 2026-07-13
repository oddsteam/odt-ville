// Groups the decorate palette (#165) under each object's free-form `kind` and
// filters by a search query (name or kind, case-insensitive). Kinds and objects
// keep their incoming order, so a new kind just appears as a new section with no
// code change. Empty/whitespace query = no filter.

import type { TileObject } from '../catalog/tileObjects/schema.ts'

export type PaletteGroup = { kind: string; objects: readonly TileObject[] }

export function groupPalette(objects: readonly TileObject[], query: string): PaletteGroup[] {
  const q = query.trim().toLowerCase()
  const groups: PaletteGroup[] = []
  const byKind = new Map<string, TileObject[]>()
  for (const o of objects) {
    if (q && !o.name.toLowerCase().includes(q) && !o.kind.toLowerCase().includes(q)) continue
    let bucket = byKind.get(o.kind)
    if (!bucket) {
      bucket = []
      byKind.set(o.kind, bucket)
      groups.push({ kind: o.kind, objects: bucket })
    }
    bucket.push(o)
  }
  return groups
}
