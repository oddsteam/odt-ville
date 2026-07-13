// Pure character-manifest shape logic (ADR-0004 kernel: sits beneath both the
// producers and the game runtime, depends on nobody). No I/O, no React, no
// Effect — just the posture-slot vocabulary and frame math shared by the
// sprite-mapper, roster, picker and the game's character rig. The data-service
// side of the manifest (fetch/persist) stays in src/character/manifest.js,
// which re-exports these for its existing callers.

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
