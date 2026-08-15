// Picking geometry for the Tile-Object Mapper: which cell of the source sheet
// or the footprint preview a pointer landed on, and how a picked box becomes a
// standalone PNG. Split out of TileMapper.tsx in #353.

import { TILESETS } from '../catalog/groundTiles/service.ts'

// 'strip' is the animated-object import (#436): the uploaded PNG is a
// horizontal frame strip that becomes the art verbatim, not a sheet to pick
// cells off. It sizes its frames off the same manual Cell input as an upload.
export type Source = 'tileset' | 'upload' | 'strip'

// The grid's cell size for the current source (#351). A registry tileset carries
// its own cell, so the Cell input is hidden and ignored in tileset mode.
export function effectiveCell(source: Source, tilesetName: string, manualCell: number): number {
  if (source !== 'tileset') return manualCell
  return (TILESETS.find((t) => t.name === tilesetName) ?? TILESETS[0]).cell
}

// Map a click on the footprint preview (rectW×rectH px showing cols×rows tiles)
// to a clamped door-cell offset. The town uses this single cell as the building
// entrance — what isWalkable / playerDepthAt / door-entry all read (issue #29).
export function doorCellFromClick(
  px: number, py: number, rectW: number, rectH: number, cols: number, rows: number,
): { dx: number; dy: number } {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.floor(v)))
  return { dx: clamp((px / rectW) * cols, cols), dy: clamp((py / rectH) * rows, rows) }
}

// Map a click on the footprint preview to the nearest side of the clicked cell
// (#53) — whichever of top/bottom/left/right edge the click lands closest to.
export function edgeSideFromClick(
  px: number, py: number, rectW: number, rectH: number, cols: number, rows: number,
): { c: number; r: number; side: 'N' | 'E' | 'S' | 'W' } {
  const clamp = (v: number, max: number) => Math.min(max - 1, Math.max(0, Math.floor(v)))
  const fx = (px / rectW) * cols
  const fy = (py / rectH) * rows
  const c = clamp(fx, cols)
  const r = clamp(fy, rows)
  const dN = fy - r // distance to top edge
  const dS = r + 1 - fy
  const dW = fx - c
  const dE = c + 1 - fx
  const min = Math.min(dN, dS, dW, dE)
  const side = min === dN ? 'N' : min === dS ? 'S' : min === dW ? 'W' : 'E'
  return { c, r, side }
}
