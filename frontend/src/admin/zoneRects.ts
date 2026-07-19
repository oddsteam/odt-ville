// The zones overlay for the decorate editor: what MapPreview paints over the
// map when the zones mode is on. Each zone contributes its anchor rect, and a
// selected `on_sight` zone (#86) also contributes its cone — one 1×1 rect per
// tile it sees — so an author picking "faces down, sees 4" gets that answer on
// the preview instead of having to load the map and walk into it (#256). The
// cone cells come from the kernel's `sightCells`, the same geometry the runtime
// fires on, so the drawing can't drift from the behaviour.

import type { Zone } from '../kernel/schema.ts'
import { sightCells } from '../kernel/zones.ts'
import type { ZoneKind } from '../maps/service.ts'

// One tint per payload kind, so the overlay reads at a glance:
// portal = blue (travel), link = amber (external page), trainer = red (a duel),
// encounter = green (wild grass).
export const ZONE_COLORS: Record<ZoneKind, string> = {
  portal: '#3b82f6',
  link: '#f59e0b',
  trainer: '#ef4444',
  encounter: '#22c55e',
}

export type ZoneRect = {
  x: number
  y: number
  w: number
  h: number
  color: string
  label: string
  selected: boolean
}

export function zoneRects(zones: readonly Zone[], selected: number | null): ZoneRect[] {
  return zones.flatMap((z, i) => {
    const color = ZONE_COLORS[z.payload.kind]
    const anchor = { x: z.x, y: z.y, w: z.w ?? 1, h: z.h ?? 1, color, label: z.payload.kind, selected: i === selected }
    // Only the selected cone draws: a map with several trainers would be soup.
    // Unselected and unlabelled, the cells read as dimmer than their anchor.
    const cone =
      z.trigger === 'on_sight' && i === selected
        ? sightCells(z).map((c) => ({ ...c, w: 1, h: 1, color, label: '', selected: false }))
        : []
    return [anchor, ...cone]
  })
}
