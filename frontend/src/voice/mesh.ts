// Proximity voice (#159), media layer: the browser adapter shells inject into
// MapScene via the Phaser registry (the same path presence takes, ADR-0004; the
// game runtime never imports voice).
//
// ADR-0011 retired the peer mesh (#517): it could not traverse residential NAT
// (#290), and prod ran on the LiveKit SFU behind a flag anyway. So connectVoice
// IS the LiveKit room now — no transport branch, no signalling relay, no flag.
// The VoiceMesh port keeps its name (the rename/move is the follow-up, #522).

import { connectLivekitRoom } from './livekit.ts'
import type { MeetingRect } from './room.ts'
import type { VoicePosition } from './schema.ts'

export interface VoiceMesh {
  update(own: VoicePosition, roster: Map<string, VoicePosition>): void
  setMute(muted: boolean): void
  // Publish/unpublish the local camera in a meeting room (#487). Optional until
  // the port rename (#522) makes it required — only the LiveKit path implements it.
  setCamera?(on: boolean): void
  // Share/stop sharing the screen in a meeting room (#489). LiveKit-only, like setCamera.
  setScreenShare?(on: boolean): Promise<void>
  stop(): void
}

// Browser adapter: connectVoice always returns the LiveKit handle (#517). Null
// (voice cleanly off) when there is no LiveKit URL or auth token. `meetingRects`
// are this map's authored meeting zones (#486), honoured with no env flag.
export function connectVoice(
  slug: string,
  ownId: string,
  meetingRects: readonly MeetingRect[] = [],
): VoiceMesh | null {
  return connectLivekitRoom(slug, ownId, meetingRects)
}

// dev/e2e seam only; noop where there is no window (unit env). The voice meter
// overlay (VoiceMeters.tsx) reads it to visualise inbound peer audio.
declare global {
  interface Window {
    __voice?: { received: Map<string, MediaStream> }
  }
}
