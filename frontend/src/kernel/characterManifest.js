// Pure character-manifest shape logic (ADR-0004 kernel: sits beneath both the
// producers and the game runtime, depends on nobody). No I/O, no React, no
// Effect — just the posture-slot vocabulary, manifest shape and frame math
// shared by the sprite-mapper, roster, picker and the game's character rig.
// The data-service side of the manifest (fetch/persist) lives in
// src/character/service.ts.

import { TILE } from './constants.ts'

// Posture slot keys in display order, grouped idle/walk per direction, plus the
// climb slots (#55). Climb is optional: a character without climb frames falls
// back to walk on a ladder cell (#54), so old manifests keep working untouched.
// There's one vertical climb slot (climbDown) shared by up and down — a ladder
// pose reads the same either way — and optional climbLeft/climbRight.
export const POSTURE_SLOTS = [
  { key: 'idleDown', label: 'Idle Down', dir: 'down', kind: 'idle' },
  { key: 'walkDown', label: 'Walk Down', dir: 'down', kind: 'walk' },
  { key: 'climbDown', label: 'Climb Up/Down', dir: 'down', kind: 'climb' },
  { key: 'idleUp', label: 'Idle Up', dir: 'up', kind: 'idle' },
  { key: 'walkUp', label: 'Walk Up', dir: 'up', kind: 'walk' },
  { key: 'idleLeft', label: 'Idle Left', dir: 'left', kind: 'idle' },
  { key: 'walkLeft', label: 'Walk Left', dir: 'left', kind: 'walk' },
  { key: 'climbLeft', label: 'Climb Left', dir: 'left', kind: 'climb' },
  { key: 'idleRight', label: 'Idle Right', dir: 'right', kind: 'idle' },
  { key: 'walkRight', label: 'Walk Right', dir: 'right', kind: 'walk' },
  { key: 'climbRight', label: 'Climb Right', dir: 'right', kind: 'climb' },
]

export const POSTURE_KEYS = POSTURE_SLOTS.map((s) => s.key)

// The sprite-mapper authors characters against a 32-px tile grid; everything
// that renders one at TILE scales by the ratio, so a 32×64 frame stays exactly
// one tile wide and two tall. Shared by the game's rig and the map renderer's
// placed NPCs so the two can't size the same sheet differently.
export const CHAR_TILE_BASIS = 32

// On-screen scale for a manifest sprite: its authored scale against the tile
// basis. Sprites scale rather than display-size, because an animating rig's
// frames differ in size — a fixed display size would stretch each one.
export function characterScale(m) {
  return (m?.render?.scale || 1) * (TILE / CHAR_TILE_BASIS)
}

// The image src the preview/mapper should load: an uploaded sheet is stored
// inline as a data URL (embedded in the saved manifest); a bundled sheet is
// referenced by repo path.
export function resolveSheetSrc(m) {
  return m?.sheet?.dataUrl || m?.sheet?.path || ''
}

// Resolve the animation + flip to use for a movement direction, applying the
// fallback: a direction with no frames borrows the matching down posture
// (left additionally flips horizontally).
export function framesForFacing(m, dir, kind) {
  const slot = kind + cap(dir)
  const own = m.postures?.[slot]
  if (own && own.length) {
    return { slot, frames: own, flipX: false }
  }
  // Fallback to the down posture of the same kind.
  const downSlot = kind + 'Down'
  return {
    slot: downSlot,
    frames: m.postures?.[downSlot] || [],
    flipX: dir === 'left',
  }
}

function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function emptyPostures() {
  return POSTURE_KEYS.reduce((acc, k) => {
    acc[k] = []
    return acc
  }, {})
}

export function emptyManifest() {
  return {
    version: 1,
    name: 'untitled',
    sheet: { path: '', width: 0, height: 0 },
    grid: { frameWidth: 32, frameHeight: 64 },
    render: { originX: 0.5, originY: 1, scale: 1 },
    frameRate: 9,
    postures: emptyPostures(),
  }
}

// Fill in any missing fields so a partial/old manifest still works.
export function normalizeManifest(m) {
  const base = emptyManifest()
  if (!m || typeof m !== 'object') return base
  return {
    ...base,
    ...m,
    sheet: { ...base.sheet, ...(m.sheet || {}) },
    grid: { ...base.grid, ...(m.grid || {}) },
    render: { ...base.render, ...(m.render || {}) },
    postures: { ...base.postures, ...(m.postures || {}) },
  }
}
