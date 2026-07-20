// Presence multiplayer on the village door path (#269). MapPage gets "one room
// at a time" for free — routing to the next map unmounts the last one — but a
// door enters an authored map *inside the village's own game*, so nothing
// unmounts and the shell has to close the old room itself.
//
// Deps are injected (the viewer id, the cable connect) so this stays pure: the
// wire lives in presenceClient, the data fetch in the page (ADR-0004).

import type { PresenceHandle } from './presenceClient.ts'

export interface PresenceSessionDeps {
  viewerId: () => Promise<string | null>
  connect: (slug: string) => PresenceHandle | null
}

// The registry bundle MapScene reads: the handle plus the id it filters its
// own echoed frames by.
export type OpenPresence = PresenceHandle & { ownId: string }

export function presenceSession({ viewerId, connect }: PresenceSessionDeps) {
  let current: PresenceHandle | null = null

  const close = () => {
    current?.disconnect()
    current = null
  }

  // Open the room for `map`, closing whatever was open first — an onward hop
  // to a solo map therefore leaves no room behind. A solo map or an unknown
  // viewer opens nothing, which is presence off, not an error.
  const open = async (map: { slug: string; multiplayer?: boolean }): Promise<OpenPresence | null> => {
    close()
    if (!map.multiplayer) return null
    const ownId = await viewerId()
    if (!ownId) return null
    current = connect(map.slug)
    return current && { ownId, ...current }
  }

  return { open, close }
}
