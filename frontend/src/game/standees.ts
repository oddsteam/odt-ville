// Standees appearing and vanishing live (#375): pure frame-folding for the
// Standee roster, the mirror of presence.ts:applyFrame. No Phaser, no network —
// MapScene renders off the returned action, PresenceChannel's map-wide
// `standees:map:<id>` stream owns the wire.
//
// The stream is deliberately unpartitioned: a deploy is rarer than a card
// change, rarer still than a movement frame, so the whole map hears about it.
// Deploy and pickup remain durable REST writes; this only folds their echo.

// One Standee as the scene holds it, minus the sprite the scene owns — the same
// shape mapStandees' LiveStandee carries, plus the owner's manifest id, which a
// mid-scene arrival needs to look up a rig the boot path preloaded for it.
export interface StandeeNote {
  id: number
  message: string
  detail: string | null
  ownerName: string | null
  ownerAvatarUrl: string | null
  replyLink: string | null
  // Always false on the wire: a fanout carries no per-recipient view, and every
  // recipient left after own-echo suppression is by definition not the owner.
  mine: boolean
  tile: { x: number; y: number }
  manifestId: number | null
}

// The serializer's payload, snake_case straight off the REST shape it reuses.
interface WireStandee {
  id: number
  x: number
  y: number
  message: string
  detail: string | null
  reply_link: string | null
  owner_name: string | null
  owner_avatar_url: string | null
  character_manifest_id: number | null
}

export type StandeeFrame =
  | { type: 'standee:deploy'; userId: string; standee: WireStandee }
  | { type: 'standee:pickup'; userId: string; id: number }

export type StandeeResult<T> =
  | { action: 'add'; standee: StandeeNote }
  | { action: 'remove'; standee: T }
  | { action: 'none' }

const NONE = { action: 'none' } as const

// Fold one wire frame into the roster and say what the scene must do about it.
// Removal folds in place (the scene only has to destroy the sprite it gets
// back); an add cannot, because the entry isn't complete until the scene stamps
// a sprite onto it — so this names the Standee and the scene pushes it. Own
// echoes and malformed frames fold to 'none': our own cutout already went up on
// the write, and a bad frame must never crash the render loop.
export function applyStandeeFrame<T extends { id: number }>(
  roster: T[],
  frame: unknown,
  ownId: string,
): StandeeResult<T> {
  const f = frame as Partial<StandeeFrame> | undefined
  if (typeof f?.userId !== 'string' || f.userId === ownId) return NONE

  if (f.type === 'standee:pickup') {
    const i = roster.findIndex((s) => s.id === f.id)
    if (typeof f.id !== 'number' || i === -1) return NONE
    return { action: 'remove', standee: roster.splice(i, 1)[0] as T }
  }
  if (f.type !== 'standee:deploy') return NONE

  const s = f.standee
  if (typeof s?.id !== 'number' || typeof s.x !== 'number' || typeof s.y !== 'number') return NONE
  if (roster.some((held) => held.id === s.id)) return NONE

  return {
    action: 'add',
    standee: {
      id: s.id,
      message: s.message,
      detail: s.detail ?? null,
      ownerName: s.owner_name ?? null,
      ownerAvatarUrl: s.owner_avatar_url ?? null,
      replyLink: s.reply_link ?? null,
      mine: false,
      tile: { x: s.x, y: s.y },
      manifestId: s.character_manifest_id ?? null,
    },
  }
}
