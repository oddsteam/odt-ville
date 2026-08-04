// Standees as live runtime cutouts (#369, ADR-0015). A Standee is a copy of the
// owner's avatar the shell resolves by reference and hands over the registry
// (`bakedStandees`) — never baked into the map document, and drawn here as a
// static effigy: the owner's idle-down frame, never animated.
//
// The load-bearing rule is that a Standee *never blocks*. This module
// deliberately exports no blocking predicate (contrast mapNpcs' `npcBlockedFor`),
// and MapScene never feeds a standee into `mapWalkable` — so the avatar walks
// straight through a cutout's cell. It sorts against the avatar with the very
// same rule placed NPCs use (`npcDepth`), and a dangling owner (no rig, or a
// sheet that never loaded) falls back to the bundled still rather than crashing.

import { TILE } from '../constants.js'
import { standeeSheetKey, MAP_ENTITY_DEPTH } from '../../kernel/mapRenderer.ts'
import { framesForFacing, characterScale } from '../../kernel/characterManifest.js'
import { npcDepth } from './mapNpcs.ts'

// The Phaser scene, structurally — same loose convention as the renderers.
type Scene = any

// A Standee, live: the cell it stands on, the Placard it carries, and the
// cutout sprite drawing it. No `moveTo` — a Standee never moves — and no facing
// to command: it is a static effigy of its absent owner. The Placard fields
// (short line, detail body, who left it) ride along so a press-A can hand them
// to the shell without a second lookup — the game never renders them (#372).
export interface LiveStandee {
  id: number
  message: string
  detail: string | null
  ownerName: string | null
  ownerAvatarUrl: string | null
  replyLink: string | null
  // Whether the viewer owns this cutout (#370): press-A offers *pick up* on your
  // own, *reply* on someone else's — the affordance differs by who is asking.
  mine: boolean
  tile: { x: number; y: number }
  sprite: any
}

// The full Placard a press-A reveals (#372): the short line, the detail body,
// and who left it. A plain data shape the game emits to the shell — which owns
// every pixel of the panel; the game imports no panel and no data service.
export interface Placard {
  id: number
  message: string
  detail: string | null
  ownerName: string | null
  ownerAvatarUrl: string | null
  replyLink: string | null
  // Ownership rides through so the shell shows *pick up* on the owner's own
  // cutout and *reply* on anyone else's (#370).
  mine: boolean
}

// What the shell places over the registry: the cell, the Placard (short line +
// detail body + owner attribution), and the owner's rig resolved by reference
// (null when the owner has no manifest).
type BakedStandee = {
  id: number
  x: number
  y: number
  message: string
  detail?: string | null
  ownerName?: string | null
  ownerAvatarUrl?: string | null
  replyLink?: string | null
  mine?: boolean
  manifest: unknown
}

// The bundled fallback frame — the same still MapScene loads for the no-manifest
// avatar. A Standee whose owner has no rig (or whose sheet never loaded) stands
// as this rather than leaving a hole or crashing the scene (ADR-0015).
const FALLBACK_FRAME = 'player.down.0'

// Bring the shell's placed Standees to life: one cutout each, bottom-centre in
// its cell. Note what is absent — no walk_mask, no blocked cell, no live
// predicate: a Standee contributes nothing to walkability, by construction.
export function spawnStandees(scene: Scene): LiveStandee[] {
  const standees: BakedStandee[] = scene._bakedStandees || []
  return standees.map((s) => ({
    id: s.id,
    message: s.message,
    detail: s.detail ?? null,
    ownerName: s.ownerName ?? null,
    ownerAvatarUrl: s.ownerAvatarUrl ?? null,
    replyLink: s.replyLink ?? null,
    mine: s.mine ?? false,
    tile: { x: s.x, y: s.y },
    sprite: stampStandee(scene, s),
  }))
}

// The Standee whose cell matches `tile`, or undefined — the press-A lookup
// (#372). A Standee never blocks, so the avatar can share its cell; pressing A
// on your own tile or the one you face reads whichever cutout stands there.
export function standeeAt(
  standees: ReadonlyArray<LiveStandee>,
  tile: { x: number; y: number },
): LiveStandee | undefined {
  return standees.find((s) => s.tile.x === tile.x && s.tile.y === tile.y)
}

// The Placard a press-A hands to the shell (#372): the note, stripped of the
// live sprite and cell the panel has no use for.
export function placardOf(s: LiveStandee): Placard {
  return {
    id: s.id,
    message: s.message,
    detail: s.detail,
    ownerName: s.ownerName,
    ownerAvatarUrl: s.ownerAvatarUrl,
    replyLink: s.replyLink,
    mine: s.mine,
  }
}

// One cutout sprite. With a loaded rig sheet, the owner's idle-down frame sliced
// from it (the same tex.add() the avatar and placed NPCs use), static — never a
// loop. Without one, the bundled still. Always bottom-centre at the cell.
function stampStandee(scene: Scene, s: BakedStandee) {
  const wx = (s.x + 0.5) * TILE
  const wy = (s.y + 1) * TILE
  const key = standeeSheetKey(s.id)
  const rig = s.manifest as
    | { postures?: Record<string, ReadonlyArray<{ x: number; y: number; w: number; h: number }>> }
    | null
  if (rig && scene.textures?.exists?.(key)) {
    const { slot, frames, flipX } = framesForFacing(rig, 'down', 'idle')
    const rect = frames[0]
    if (rect) {
      const frame = `${slot}.0`
      const tex = scene.textures.get(key)
      if (!tex.has(frame)) tex.add(frame, 0, rect.x, rect.y, rect.w, rect.h)
      return scene.add
        .sprite(wx, wy, key, frame)
        .setOrigin(0.5, 1)
        .setScale(characterScale(rig))
        .setFlipX(!!flipX)
        .setDepth(MAP_ENTITY_DEPTH)
    }
  }
  // Bundled fallback — a dangling owner reference renders rather than crashing.
  return scene.add
    .image(wx, wy, FALLBACK_FRAME)
    .setOrigin(0.5, 1)
    .setDisplaySize(TILE, TILE * 2)
    .setDepth(MAP_ENTITY_DEPTH)
}

// A Standee is a character-shaped cutout, so it sorts against the avatar exactly
// as a placed NPC does (#295): one standing further south covers the avatar, one
// level or north draws behind. Reuses `npcDepth` — "the existing NPC depth rule".
export function sortStandees(
  standees: ReadonlyArray<{ tile: { x: number; y: number }; sprite: any }>,
  avatarRow: number,
) {
  for (const s of standees) s.sprite?.setDepth(npcDepth(s.tile.y, avatarRow))
}
