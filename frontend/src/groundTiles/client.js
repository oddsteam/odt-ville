// Ground-tile API client — grass/road/… cells tagged by atlas coordinate in
// the ground-tile mapper. A tile is just a (tileset, col, row) reference plus
// its surface type, never an image blob.
//
// The resource (list + save + remove) lives in `service.ts` as a typed Effect
// service with an effect/Schema decoder. The helpers below are thin Promise
// façades over that service for the existing JSX call sites (VillagePage,
// GroundTileMapper), keeping the same signatures so callers stay plain
// async/await.

import { runEdge } from '../lib/runEdge.ts'
import { GroundTilesService } from './service.ts'

// GET /ground_tiles -> the catalog (optionally filtered by surface type).
export function listGroundTiles(type) {
  return runEdge(GroundTilesService.list(type))
}

// POST /ground_tiles -> upsert one cell by (tileset, col, row).
export function saveGroundTile({ tile_type, tileset, col, row, cell, label, role, side }) {
  return runEdge(
    GroundTilesService.save({ tile_type, tileset, col, row, cell, label, role, side }),
  )
}

// DELETE /ground_tiles/:id -> remove a cell from the catalog.
export function deleteGroundTile(id) {
  return runEdge(GroundTilesService.remove(id))
}
