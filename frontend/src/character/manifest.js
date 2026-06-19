// Character sprite manifest — shared between the sprite-mapper tool (which
// writes it) and the map preview scene (which reads it). A manifest maps
// posture slots (idle/walk × 4 directions) to ordered lists of frame rects
// on a source sheet. See public/maps/characters/scout.json for the shape.

export const DIRECTIONS = ['down', 'up', 'left', 'right']

// Posture slot keys in display order, grouped idle/walk per direction.
export const POSTURE_SLOTS = [
  { key: 'idleDown', label: 'Idle Down', dir: 'down', kind: 'idle' },
  { key: 'walkDown', label: 'Walk Down', dir: 'down', kind: 'walk' },
  { key: 'idleUp', label: 'Idle Up', dir: 'up', kind: 'idle' },
  { key: 'walkUp', label: 'Walk Up', dir: 'up', kind: 'walk' },
  { key: 'idleLeft', label: 'Idle Left', dir: 'left', kind: 'idle' },
  { key: 'walkLeft', label: 'Walk Left', dir: 'left', kind: 'walk' },
  { key: 'idleRight', label: 'Idle Right', dir: 'right', kind: 'idle' },
  { key: 'walkRight', label: 'Walk Right', dir: 'right', kind: 'walk' },
]

export const POSTURE_KEYS = POSTURE_SLOTS.map((s) => s.key)

// localStorage key holding the single "active" manifest the preview reads.
export const ACTIVE_KEY = 'odt.character.activeManifest'

// Path the preview falls back to when localStorage is empty (committed default).
export const DEFAULT_MANIFEST_URL = '/maps/characters/scout.json'

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

// The image src the preview/mapper should load: an uploaded sheet is stored
// inline as a data URL (so it survives across pages via localStorage); a
// bundled sheet is referenced by repo path.
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

// --- persistence -------------------------------------------------------

// Backend API for shared, cross-origin persistence (see the Rails
// character_manifests controller). The dev server proxies /api to Rails.
const API_BASE = '/api/v1'

export function saveActiveManifest(m) {
  try {
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(m))
    return true
  } catch (err) {
    // Most likely the quota was exceeded by an embedded data-URL sheet.
    console.warn('saveActiveManifest failed:', err)
    return false
  }
}

// Persist the manifest to the backend so every browser and origin sees it,
// and make it the single active character. Throws on failure (the caller
// surfaces the message); does NOT touch localStorage.
export async function saveActiveManifestRemote(m) {
  const res = await fetch(`${API_BASE}/character_manifests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manifest: normalizeManifest(m), active: true }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Save failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// Fetch the active manifest from the backend. Returns a normalized manifest,
// or null when nothing is saved (204) or the backend is unreachable.
async function fetchRemoteActive() {
  try {
    const res = await fetch(`${API_BASE}/character_manifests/active`)
    if (res.status === 204 || !res.ok) return null
    const text = await res.text()
    if (!text) return null
    const payload = JSON.parse(text)
    return payload?.data ? normalizeManifest(payload.data) : null
  } catch (err) {
    console.warn('fetching remote manifest failed:', err)
    return null
  }
}

// Resolve the active manifest, preferring shared backend state, then this
// browser's localStorage, then the committed default. Always returns a
// normalized manifest (never throws).
export async function loadActiveManifest() {
  const remote = await fetchRemoteActive()
  if (remote) return remote
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (raw) return normalizeManifest(JSON.parse(raw))
  } catch (err) {
    console.warn('reading active manifest failed, using default:', err)
  }
  try {
    const res = await fetch(DEFAULT_MANIFEST_URL)
    if (res.ok) return normalizeManifest(await res.json())
  } catch (err) {
    console.warn('fetching default manifest failed:', err)
  }
  return emptyManifest()
}

// Produce the committable form of a manifest: strip the inline data URL and
// point at the conventional repo path so the JSON is portable. Returns the
// cleaned manifest plus, when relevant, the path the user must drop the PNG.
export function toDownloadable(m) {
  const clean = normalizeManifest(m)
  let note = null
  if (clean.sheet.dataUrl) {
    const file = `${clean.name || 'character'}.png`
    const path = `/maps/characters/sheets/${file}`
    clean.sheet = { path, width: clean.sheet.width, height: clean.sheet.height }
    note = `This sheet was uploaded. Place its PNG at frontend/public${path} so the game can load it.`
  }
  return { manifest: clean, note }
}

export function downloadManifest(m) {
  const { manifest, note } = toDownloadable(m)
  const blob = new Blob([JSON.stringify(manifest, null, 1)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${manifest.name || 'character'}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return note
}
