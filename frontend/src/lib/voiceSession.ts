// Proximity voice on the village door path (#287). The counterpart of
// presenceSession (#269): entering an authored map through a door never routes,
// so nothing unmounts between hops and the shell must tear down the previous
// map's mesh itself — exactly one voice mesh open at a time. connectVoice tears
// itself down via MapScene's SHUTDOWN too, but the door path opens the next
// mesh before the scene stops the last, so we close the old one first here.
//
// Deps are injected (the viewer id, the mesh connect) so this stays pure: the
// wire lives in voice/mesh, the data fetch in the page (ADR-0004). Mirrors the
// presence guard exactly — a solo map or an unknown viewer opens nothing, which
// is voice off, not an error.

import type { VoiceMesh } from '../voice/mesh.ts'
import { meetingRectsOf, type MeetingRect } from '../voice/service.ts'
import type { Zone } from '../kernel/schema.ts'

export interface VoiceSessionDeps {
  viewerId: () => Promise<string | null>
  connect: (slug: string, ownId: string, meetingRects: readonly MeetingRect[]) => VoiceMesh | null
}

export function voiceSession({ viewerId, connect }: VoiceSessionDeps) {
  let current: VoiceMesh | null = null

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
  }): Promise<VoiceMesh | null> => {
    close()
    if (!map.multiplayer) return null
    const ownId = await viewerId()
    if (!ownId) return null
    current = connect(map.slug, ownId, meetingRectsOf(map.zones))
    return current
  }

  return { open, close }
}
