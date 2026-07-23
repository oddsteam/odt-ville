// Placed NPCs as live runtime entities (#295). #294 put an NPC on the map as a
// stamp; this is what makes it a character: the sprite the kernel placed gets
// its own rig (keyed by sheet since #267, so two NPCs animate side by side), and
// the live entity — not the baked document — owns where it stands.
//
// That ownership is the point. The authored `walk_mask` and `facing` are the
// *starting* values; the moment something walks an NPC, a cell derived from the
// authored anchor is an invisible wall. So collision reads `npc.tile`, which
// `moveTo` moves along with the sprite. Nothing commands the move yet — this is
// the handle that makes one possible.

import { npcSheetKey } from '../../kernel/mapRenderer.ts'
import { buildCharacterRig, applyFacing } from './characterRig.js'
import { feetWorldXY, MAP_PLAYER_DEPTH } from './mapWalk.ts'
import type { BakedEntity, ZoneFacing } from '../../kernel/schema.ts'

// The Phaser scene, structurally — same loose convention as the renderers.
type Scene = any

// A placed NPC, live: where it stands now, which way it is posed, and the sprite
// drawing it. `moveTo` is the whole command surface — everything else about it
// (art, level, identity) lives on the catalog row it references.
export interface LiveNpc {
  id: number
  facing: ZoneFacing
  tile: { x: number; y: number }
  sprite: any
  moveTo(x: number, y: number): void
}

// Bring the kernel's NPC stamps to life: rig each sprite from the manifest the
// shell supplied and start the idle pose for its authored facing — a loop when
// the posture has frames to cycle, a still frame when it doesn't (applyFacing
// decides, exactly as it does for the avatar). An NPC the renderer couldn't draw
// (dangling npc_id, no rig, sheet that never loaded) left no stamp, so it spawns
// no entity — deliberately: a blocked cell with nothing drawn on it is precisely
// the invisible wall this slice exists to remove.
export function spawnNpcs(scene: Scene): LiveNpc[] {
  // The manifest blob stays free-form here, exactly as the character rig takes it.
  const rigs = new Map<number, any>(
    (scene._bakedNpcs || []).map((n: { id: number; manifest: unknown }) => [n.id, n.manifest]),
  )
  return (scene._npcSprites || []).map(({ entity, sprite }: { entity: BakedEntity; sprite: any }) => {
    const npc: LiveNpc = {
      id: entity.npc_id!,
      facing: entity.facing ?? 'down',
      tile: { x: entity.x, y: entity.y },
      sprite,
      moveTo(x, y) {
        this.tile = { x, y }
        const feet = feetWorldXY(this.tile, true)
        this.sprite?.setPosition(feet.x, feet.y)
      },
    }
    const manifest = rigs.get(npc.id)
    const rig = manifest && buildCharacterRig(scene, manifest, npcSheetKey(npc.id))
    if (rig && rig.usingManifest) applyFacing(sprite, rig.charDir, npc.facing, false)
    return npc
  })
}

// The cells the live NPCs occupy, as a predicate read at call time — never a
// snapshot, so a moved NPC blocks where it *is*. This replaces the placed NPC's
// baked walk_mask at runtime (the mask stays the authored starting position, and
// the server still reads it that way for door reachability).
export function npcBlockedFor(
  npcs: ReadonlyArray<{ tile: { x: number; y: number } }>,
): (x: number, y: number) => boolean {
  return (x, y) => npcs.some((n) => n.tile.x === x && n.tile.y === y)
}

// An NPC is a character, so it sorts against the avatar rather than sitting in
// the flat entity band: one standing further south covers the avatar (whose head
// reaches into the row above it), one level or further north draws behind. This
// is the map path's cheap stand-in for the town's y-sorting — with a handful of
// NPCs, re-sorting per step costs nothing.
export const MAP_NPC_FRONT_DEPTH = MAP_PLAYER_DEPTH + 1
export const MAP_NPC_BEHIND_DEPTH = MAP_PLAYER_DEPTH - 1

export function npcDepth(npcRow: number, avatarRow: number): number {
  return npcRow > avatarRow ? MAP_NPC_FRONT_DEPTH : MAP_NPC_BEHIND_DEPTH
}

// Re-sort every NPC against the row the avatar is on (or stepping to).
export function sortNpcs(
  npcs: ReadonlyArray<{ tile: { x: number; y: number }; sprite: any }>,
  avatarRow: number,
) {
  for (const n of npcs) n.sprite?.setDepth(npcDepth(n.tile.y, avatarRow))
}
