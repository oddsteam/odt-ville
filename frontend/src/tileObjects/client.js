// Tile-object API client — trees/props cropped from an atlas in the
// tile-object mapper and rendered on the town map.
//
// The resource (getActive + save + list + activate) lives in `service.ts` as a
// typed Effect service with effect/Schema decoders. The helpers below are thin
// Promise façades over that service for the JSX call sites (VillagePage,
// TileMapper), keeping the same signatures so callers stay plain async/await.

import { runEdge } from '../lib/runEdge.ts'
import { TileObjectsService } from './service.ts'

// GET /tile_objects/active?kind= -> the live object (or null when none).
export function getActiveTileObject(kind = 'tree') {
  return runEdge(TileObjectsService.getActive(kind))
}

// POST /tile_objects -> upsert by name + make it the live object of its kind.
// door_dx/door_dy + walk_mask are only sent for 'building' objects (#29, #32).
/**
 * @param {{ name: string, kind: string, image: string, footprint_w: number,
 *   footprint_h: number, door_dx?: number, door_dy?: number,
 *   walk_mask?: readonly string[] }} o
 */
export function saveTileObject({ name, kind, image, footprint_w, footprint_h, door_dx, door_dy, walk_mask }) {
  return runEdge(TileObjectsService.save({ name, kind, image, footprint_w, footprint_h, door_dx, door_dy, walk_mask }))
}

// GET /tile_objects[?kind=] -> roster summaries (no image blobs).
export function listTileObjects(kind) {
  return runEdge(TileObjectsService.list(kind))
}

// POST /tile_objects/:id/activate -> make that object the live one of its kind.
export function activateTileObject(id) {
  return runEdge(TileObjectsService.activate(id))
}

// POST /tile_objects/:id/deactivate -> turn it off (kind falls back to default).
export function deactivateTileObject(id) {
  return runEdge(TileObjectsService.deactivate(id))
}
