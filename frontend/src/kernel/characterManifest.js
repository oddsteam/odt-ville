// Pure character-manifest shape logic (ADR-0004 kernel: sits beneath both the
// producers and the game runtime, depends on nobody). No I/O, no React, no
// Effect — just the posture-slot vocabulary, manifest shape and frame math
// shared by the sprite-mapper, roster, picker and the game's character rig.
// The data-service side of the manifest (fetch/persist) lives in
// src/character/service.ts.

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

// The single frame a character shows standing still facing `dir`: its idle
// posture's first frame, else its walk posture's (a character with no idle
// art). Null when it authors neither. Peer avatars render these stills (#266)
// — walk loops stay the rig's job.
export function stillForFacing(m, dir) {
  for (const kind of ['idle', 'walk']) {
    const { slot, frames, flipX } = framesForFacing(m, dir, kind)
    if (frames.length) return { name: `${slot}.0`, rect: frames[0], flipX }
  }
  return null
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
