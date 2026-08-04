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
import { peerSheetKey } from './characterRig.js'
import type { StandeeNote } from '../standees.ts'

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
  // The whole effigy — figure, stand and Placard bubble in one container (#376)
  // — so it sorts and dies as one object.
  sprite: any
  // The owner's rig, by reference (#375). Only a live arrival carries one — the
  // boot path resolved its cutout's sheet before the scene ever started, so
  // there is nothing left to look up.
  manifestId?: number | null
  // The rig sheet the cutout is currently wearing, so an upgrade re-stamps once
  // and never again — the container it rides in has no texture to compare.
  sheetKey?: string
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

// The effigy treatment (#376). A cutout wears its owner's rig and the owner may
// be standing on the same map — with three deployed there can be four copies of
// one person in view, and a visitor can press A on the wrong one. Three cues
// separate the cutout from the colleague, none of them a name label (only the
// living wear one; attribution rides inside the Placard instead): the figure is
// washed out to printed-board grey, it stands on a base plate rather than on
// the ground, and it never animates.
const EFFIGY_TINT = 0x9aa2b4
const STAND_EDGE = 0x2f3038
const STAND_TOP = 0x585c6b
const STAND_W = TILE * 0.75
const STAND_H = TILE * 0.26

// The Placard's short line, floating over the cutout's head. The card badge
// (#317) hangs a chip in this same spot over a live peer's head and is clickable
// too, so the two must not share a silhouette: a chip is a status *attached to*
// someone, a tailed bubble is someone *saying* something — and the tail points
// at whoever is saying it.
const BUBBLE_TIP_Y = -TILE * 2 - 8
const BUBBLE_TAIL = 8
const BUBBLE_PAD = 6
const BUBBLE_PAPER = 0xfdfcf4
const BUBBLE_INK = '#1c1c24'
// Clipped to the badge's own width budget (cardBadge.ts) rather than the panel's
// 60: both float over a head, so both must not blanket the avatars either side.
// The full line is in the Placard a press-A opens.
const BUBBLE_MAX = 24

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

// A Standee that arrived after boot (#375) — someone deployed one while we were
// standing here. The boot path preloads a cutout's own sheet; a live arrival has
// none, so it borrows the peer-character cache the scene already keeps by
// manifest id (#266): the owner is usually a peer standing right there, whose
// rig is already cut. Until it is (or if they have none), the bundled fallback
// stands — the same graceful degradation a dangling owner gets — and
// `restandeeRigs` swaps in the real one the moment the sheet lands.
export function addStandee(scene: Scene, note: StandeeNote): LiveStandee {
  return {
    ...note,
    sprite: stampLive(scene, note),
    sheetKey: rigOf(scene, note.manifestId) ? peerSheetKey(note.manifestId) : undefined,
  }
}

// Re-stamp the live arrivals whose owner's rig has landed since. Called when a
// peer character settles, mirroring `refreshPeers` — a cutout raised by someone
// out of range comes up as the fallback and upgrades itself a moment later.
export function restandeeRigs(scene: Scene, standees: LiveStandee[], avatarRow: number) {
  for (const s of standees) {
    const key = s.manifestId != null && peerSheetKey(s.manifestId)
    if (!key || !rigOf(scene, s.manifestId) || s.sheetKey === key) continue
    s.sprite?.destroy()
    s.sprite = stampLive(scene, s)
    s.sheetKey = key
  }
  sortStandees(standees, avatarRow)
}

const rigOf = (scene: Scene, manifestId: number | null | undefined) =>
  manifestId == null ? null : scene.peerChars?.get(manifestId) || null

// The owner's idle-down frame off their peer sheet, or the bundled still. Static
// — a Standee is an effigy — and bottom-centre on its cell, exactly like the
// boot-path cutout and the deployer's own (MapScene.addOwnStandee).
function stampLive(scene: Scene, note: { tile: { x: number; y: number }; manifestId?: number | null; message?: string }) {
  const rig = rigOf(scene, note.manifestId)
  const figure =
    rig && scene.add.sprite(0, 0, peerSheetKey(note.manifestId), rig.charDir.down.idleFrame).setScale(rig.scale)
  return cutout(scene, note.tile, figure || null, note.message || '')
}

// One cutout, whole: the figure on its stand under the Placard's bubble, in a
// single container so it sorts, moves and dies as one object — nothing of an
// effigy can be left behind when it is picked up. `figure` is the owner's rig,
// already scaled and positioned at the container's origin; null gets the
// bundled still, so a dangling owner reference renders rather than crashing.
export function cutout(scene: Scene, tile: { x: number; y: number }, figure: any, message: string) {
  const art = figure || scene.add.image(0, 0, FALLBACK_FRAME).setDisplaySize(TILE, TILE * 2)
  art.setOrigin(0.5, 1).setTint(EFFIGY_TINT)
  const g = scene.add.graphics()
  stand(g)
  return scene.add
    .container((tile.x + 0.5) * TILE, (tile.y + 1) * TILE, [g, art, ...bubble(scene, g, message)])
    .setDepth(MAP_ENTITY_DEPTH)
}

// The base plate the cutout is slotted into — a rim with a lighter top face, so
// it reads as something the figure is standing *on* rather than a shadow.
function stand(g: any) {
  g.fillStyle(STAND_EDGE, 1).fillEllipse(0, -2, STAND_W, STAND_H)
  g.fillStyle(STAND_TOP, 1).fillEllipse(0, -4, STAND_W - 6, STAND_H - 5)
}

// The speech bubble: paper rounded rect plus a tail pointing down at the cutout.
// Drawn as two passes of the same silhouette — a grown dark one, then the paper
// one on top — so the border has no seam where the tail meets the body, and the
// whole thing is two fills rather than a stroked path. A Standee with no line
// gets no bubble at all, not an empty one.
function bubble(scene: Scene, g: any, message: string) {
  const line = bubbleLine(message)
  if (!line) return []
  const text = scene.add
    .text(0, BUBBLE_TIP_Y - BUBBLE_TAIL - BUBBLE_PAD, line, { fontSize: '11px', color: BUBBLE_INK })
    .setOrigin(0.5, 1)
  const w = text.width + BUBBLE_PAD * 2
  const h = text.height + BUBBLE_PAD * 2
  paint(g, STAND_EDGE, w, h, 2)
  paint(g, BUBBLE_PAPER, w, h, 0)
  return [text]
}

// The line as the bubble shows it, clipped. The game cannot reach the shell's
// `standees/placard.ts` across the module surface (ADR-0010), and should not:
// the bubble's cap is a width budget over a head, the panel's is a paragraph
// guard. `badgeText` clips the chip beside it exactly this way.
export function bubbleLine(message: string): string {
  const line = message.trim()
  return line.length > BUBBLE_MAX ? `${line.slice(0, BUBBLE_MAX)}…` : line
}

const paint = (g: any, color: number, w: number, h: number, grow: number) => {
  const bottom = BUBBLE_TIP_Y - BUBBLE_TAIL
  g.fillStyle(color, 1)
  g.fillRoundedRect(-w / 2 - grow, bottom - h - grow, w + grow * 2, h + grow * 2, 6 + grow)
  g.fillTriangle(-BUBBLE_TAIL - grow, bottom, BUBBLE_TAIL + grow, bottom, 0, BUBBLE_TIP_Y + grow * 2)
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

// One cutout. With a loaded rig sheet, the owner's idle-down frame sliced from
// it (the same tex.add() the avatar and placed NPCs use), static — never a loop.
// Without one, `cutout` stands the bundled fallback instead.
function stampStandee(scene: Scene, s: BakedStandee) {
  const key = standeeSheetKey(s.id)
  const rig = s.manifest as
    | { postures?: Record<string, ReadonlyArray<{ x: number; y: number; w: number; h: number }>> }
    | null
  let figure = null
  if (rig && scene.textures?.exists?.(key)) {
    const { slot, frames, flipX } = framesForFacing(rig, 'down', 'idle')
    const rect = frames[0]
    if (rect) {
      const frame = `${slot}.0`
      const tex = scene.textures.get(key)
      if (!tex.has(frame)) tex.add(frame, 0, rect.x, rect.y, rect.w, rect.h)
      figure = scene.add.sprite(0, 0, key, frame).setScale(characterScale(rig)).setFlipX(!!flipX)
    }
  }
  return cutout(scene, { x: s.x, y: s.y }, figure, s.message)
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
