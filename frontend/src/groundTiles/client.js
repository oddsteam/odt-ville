// Ground-tile API client — grass/road/… cells tagged by atlas coordinate in
// the ground-tile mapper. Mirrors tileObjects/client.js; a tile is just a
// (tileset, col, row) reference plus its surface type, never an image blob.
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

// GET /ground_tiles -> the catalog (optionally filtered by surface type).
export function listGroundTiles(type) {
  return request(`/ground_tiles${type ? `?type=${encodeURIComponent(type)}` : ''}`)
}

// POST /ground_tiles -> upsert one cell by (tileset, col, row).
export function saveGroundTile({ tile_type, tileset, col, row, cell, label, role, side }) {
  return request('/ground_tiles', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ tile_type, tileset, col, row, cell, label, role, side }),
  })
}

// DELETE /ground_tiles/:id -> remove a cell from the catalog.
export function deleteGroundTile(id) {
  return request(`/ground_tiles/${id}`, { method: 'DELETE' })
}
