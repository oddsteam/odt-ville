// Tile-object API client — trees/props cropped from an atlas in the
// tile-object mapper and rendered on the town map. The only place this API
// lives, mirroring game-session/client.js.
const BASE = '/api/v1'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (res.status === 204) return null
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Request to ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// GET /tile_objects/active?kind= -> the live object (or null when none).
export function getActiveTileObject(kind = 'tree') {
  return request(`/tile_objects/active?kind=${encodeURIComponent(kind)}`)
}

// GET /tile_objects -> roster summaries (no image blobs).
export function listTileObjects(kind) {
  return request(`/tile_objects${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`)
}

// POST /tile_objects -> upsert by name + make it the live object of its kind.
export function saveTileObject({ name, kind, image, footprint_w, footprint_h }) {
  return request('/tile_objects', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ name, kind, image, footprint_w, footprint_h, active: true }),
  })
}
