// Character sprite manifest — shared between the sprite-mapper tool (which
// writes it) and the map preview scene (which reads it). A manifest maps
// posture slots (idle/walk × 4 directions) to ordered lists of frame rects
// on a source sheet. See public/maps/characters/scout.json for the shape.

import { runEdge } from '../lib/runEdge.ts'
import { CharacterService } from './service.ts'
import {
  POSTURE_KEYS,
  POSTURE_SLOTS,
  resolveSheetSrc,
  framesForFacing,
} from '../kernel/characterManifest.js'

export const DIRECTIONS = ['down', 'up', 'left', 'right']

// Pure manifest-shape logic lives in the kernel (ADR-0004, #202); re-exported
// here for this module's existing callers (sprite mapper, roster, picker).
export {
  POSTURE_KEYS,
  POSTURE_SLOTS,
  resolveSheetSrc,
  framesForFacing,
}

// Path the preview falls back to when no remote manifest is active (committed
// default).
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

// --- persistence -------------------------------------------------------

// Fetch the active manifest from the backend via the typed Effect service.
// Returns a normalized manifest, or null when nothing is saved (204) or the
// backend is unreachable (any data-layer error -> swallowed to null, so the
// fallback chain continues).
async function fetchRemoteActive() {
  const data = await runEdge(CharacterService.getActive()).catch((err) => {
    console.warn('fetching remote manifest failed:', err)
    return null
  })
  return data ? normalizeManifest(data) : null
}

// Fetch the character this user renders (#155, ADR-0009: their pick, else the
// global active) — same null-on-204/error contract as fetchRemoteActive.
async function fetchRemoteForMe() {
  const env = await runEdge(CharacterService.getForMe()).catch((err) => {
    console.warn('fetching my manifest failed:', err)
    return null
  })
  return env ? normalizeManifest(env.data) : null
}

async function committedDefault() {
  try {
    const res = await fetch(DEFAULT_MANIFEST_URL)
    if (res.ok) return normalizeManifest(await res.json())
  } catch (err) {
    console.warn('fetching default manifest failed:', err)
  }
  return emptyManifest()
}

// Resolve the active manifest deterministically from shared server state:
// remote active, then the committed default. No per-browser override, so every
// client renders the same character (#153). Always returns a normalized
// manifest (never throws). This is the *global* character — the authoring
// surfaces' notion of "current"; the game resolves per user via
// loadMyManifest.
export async function loadActiveManifest() {
  return (await fetchRemoteActive()) || committedDefault()
}

// Resolve the character the current user renders (#155): their pick, else the
// global active (both server-side via for_me), then the committed default.
export async function loadMyManifest() {
  return (await fetchRemoteForMe()) || committedDefault()
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
