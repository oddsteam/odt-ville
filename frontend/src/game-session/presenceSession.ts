// Presence multiplayer on the village door path (#269). MapPage gets "one room
// at a time" for free — routing to the next map unmounts the last one — but a
// door enters an authored map *inside the village's own game*, so nothing
// unmounts and the shell has to close the old room itself.
//
// Deps are injected (the viewer id, the cable connect) so this stays pure: the
// wire lives in presenceClient, the data fetch in the page (ADR-0004).

import type { PresenceHandle } from './presenceClient.ts'

export interface PresenceSessionDeps {
  // The local viewer: the id presence filters its own echoed frames by, plus
  // the display name MapScene labels the local avatar with (their own
  // nameplate). Null when the viewer is unknown — presence stays off.
  viewer: () => Promise<{ id: string; name: string } | null>
  connect: (slug: string) => PresenceHandle | null
  // Fetch a peer's character by the manifest id their frames carry (#266).
  loadManifest: (id: number) => Promise<unknown>
}

// The registry bundle MapScene reads: the handle, the id it filters its own
// echoed frames by, the local name it labels the own avatar with, and the
// peer-character lookup it renders peers with.
export type OpenPresence = PresenceHandle & {
  ownId: string
  ownName: string
  loadManifest: (id: number) => Promise<unknown>
}

export function presenceSession({ viewer, connect, loadManifest }: PresenceSessionDeps) {
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
    const me = await viewer()
    if (!me) return null
    current = connect(map.slug)
    return current && { ownId: me.id, ownName: me.name, loadManifest, ...current }
  }

  return { open, close }
}
