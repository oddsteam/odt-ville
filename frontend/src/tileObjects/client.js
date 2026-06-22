// Tile-object API client — trees/props cropped from an atlas in the
// tile-object mapper and rendered on the town map.
//
// The resource (getActive + save) lives in `service.ts` as a typed Effect
// service with an effect/Schema decoder. The helpers below are thin Promise
// façades over that service for the existing JSX call sites (VillagePage,
// TileMapper), keeping the same signatures so callers stay plain async/await.
//
// `listTileObjects` is still untyped fetch — it has no call sites yet and will
// migrate to the Effect pattern if/when one appears.

import { runEdge } from '../lib/runEdge.ts'
import { TileObjectsService } from './service.ts'

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

// GET /tile_objects/active?kind= -> the live object (or null when none).
export function getActiveTileObject(kind = 'tree') {
  return runEdge(TileObjectsService.getActive(kind))
}

// POST /tile_objects -> upsert by name + make it the live object of its kind.
export function saveTileObject({ name, kind, image, footprint_w, footprint_h }) {
  return runEdge(TileObjectsService.save({ name, kind, image, footprint_w, footprint_h }))
}

// GET /tile_objects -> roster summaries (no image blobs).
export function listTileObjects(kind) {
  return request(`/tile_objects${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`)
}
