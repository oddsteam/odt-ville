// Proximity voice on the village door path (#287). The counterpart of
// presenceSession (#269): entering an authored map through a door never routes,
// so nothing unmounts between hops and the shell must tear down the previous
// map's handle itself — exactly one voice handle open at a time. Since #522 the
// scene no longer stops voice on SHUTDOWN, so this session is the single owner:
// the door path closes the old handle here before opening the next.
//
// Deps are injected (the viewer id, the voice connect) so this stays pure: the
// wire lives in voice/write, the data fetch in the page (ADR-0004). Mirrors the
// presence guard exactly — a solo map or an unknown viewer opens nothing, which
// is voice off, not an error.

import type { VoiceHandle } from './schema.ts'
import type { Zone } from '../kernel/schema.ts'

export interface VoiceSessionDeps {
  viewerId: () => Promise<string | null>
  connect: (slug: string, ownId: string, zones: readonly Zone[]) => VoiceHandle | null
}

export function voiceSession({ viewerId, connect }: VoiceSessionDeps) {
  let current: VoiceHandle | null = null

  const close = () => {
    current?.stop()
    current = null
  }

  // Open the mesh for `map`, tearing down whatever was open first — an onward
  // hop to a solo map therefore leaves no mesh (no leaked peers or mic) behind.
  const open = async (map: {
    slug: string
    multiplayer?: boolean
    zones?: readonly Zone[]
  }): Promise<VoiceHandle | null> => {
    close()
    if (!map.multiplayer) return null
    const ownId = await viewerId()
    if (!ownId) return null
    current = connect(map.slug, ownId, map.zones ?? [])
    return current
  }

  return { open, close }
}
