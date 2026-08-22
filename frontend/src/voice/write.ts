// Proximity voice (#159), public write surface (#522): the browser adapter the
// shells inject into MapScene via the Phaser registry (the same path presence
// takes, ADR-0004; the game runtime never imports voice).
//
// ADR-0011 retired the peer mesh (#517): it could not traverse residential NAT
// (#290), and prod ran on the LiveKit SFU anyway. So connectVoice IS the LiveKit
// room — no transport branch, no signalling relay, no flag. The VoiceHandle port
// lives in schema.ts; this file is its sole producer.

import { connectLivekitRoom } from './livekit.ts'
import type { VoiceHandle } from './schema.ts'
import type { Zone } from '../kernel/schema.ts'

// Browser adapter: connectVoice always returns the LiveKit handle (#517). Null
// (voice cleanly off) when there is no LiveKit URL or auth token. `zones` are the
// map's authored zones (#486); the meeting resolver reads the meeting ones off
// them, honoured with no env flag.
export function connectVoice(
  slug: string,
  ownId: string,
  zones: readonly Zone[] = [],
): VoiceHandle | null {
  return connectLivekitRoom(slug, ownId, zones)
}

// dev/e2e seam only; noop where there is no window (unit env). The voice meter
// overlay (VoiceMeters.tsx) reads it to visualise inbound peer audio.
declare global {
  interface Window {
    __voice?: { received: Map<string, MediaStream> }
  }
}
