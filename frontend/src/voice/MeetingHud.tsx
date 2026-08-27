import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { meetingState, type CameraStatus, type RemoteTile, type ScreenShare, type SelfView as Track } from './meetingState.ts'
import { micState } from './micState.ts'
import { micView } from './MicIndicator.tsx'

// The meeting overlay (#487). While you stand in a meeting room (#486) this is
// your mic + camera controls and your own self-view; walking out tears it down.
// It reads the two singleton stores (meetingState / micState) and renders only
// your own tile, the remote filmstrip (#488) and the focused screen share (#489). The camera is off on entry,
// every time: publishing video is a deliberate click, never a default.

export type CameraTone = 'on' | 'off' | 'denied'
export interface CameraView {
  icon: string
  label: string
  tone: CameraTone
  clickable: boolean
  hint?: string
}

// State → what the player sees. 'denied' is terminal (nothing to click), the
// same shape as the mic-blocked state; 'off' and 'on' both toggle.
export function cameraView(camera: CameraStatus): CameraView {
  if (camera === 'denied')
    return {
      icon: '🚫',
      label: 'Camera blocked',
      tone: 'denied',
      clickable: false,
      hint: 'Allow the camera in your browser to share video.',
    }
  if (camera === 'on') return { icon: '📹', label: 'Camera on', tone: 'on', clickable: true }
  return { icon: '📷', label: 'Camera off', tone: 'off', clickable: true }
}

// A remote tile's display (#488): live video, or a name-initial placeholder when
// their camera is off, plus the active-speaker ring. Pure so it's the one bit worth
// a test; the JSX around it is trivial (cf. cameraView).
export interface TileView {
  showVideo: boolean
  initial: string
  ring: boolean
}
export function tileView(tile: RemoteTile): TileView {
  return {
    showVideo: tile.video !== null,
    initial: (tile.name.trim()[0] ?? '?').toUpperCase(),
    ring: tile.speaking,
  }
}

// The screen-share control + surface caption (#489). The button reads by whether
// *I* am sharing (someone else's share doesn't stop me starting mine — newest
// wins, see livekit.ts); the caption names whose screen is focused.
export interface ShareView {
  label: string
  caption: string | null
}
export function shareView(share: ScreenShare): ShareView {
  return {
    label: share.mine ? 'Stop sharing' : 'Share screen',
    caption: !share.focused ? null : share.focused.id === 'me' ? 'Your screen' : `${share.focused.name}'s screen`,
  }
}

// Attach a track to a <video> for as long as it lives — the self-view, the
// remote faces and the share surface all do exactly this.
function useAttach(ref: RefObject<HTMLVideoElement | null>, track: Track | null) {
  useEffect(() => {
    const el = ref.current
    if (!el || !track) return
    track.attach(el)
    return () => void track.detach()
  }, [ref, track])
}

// The surface's two sizes: large (legible) and a thumbnail. Shrinking frees the
// game canvas underneath — the whole HUD panel blocks clicks over its area, so
// the thumbnail is how you glance at a share while walking your avatar away.
export interface SurfaceView {
  width: string
  toggleIcon: string
  toggleTitle: string
}
export function surfaceView(minimized: boolean): SurfaceView {
  return minimized
    ? { width: '240px', toggleIcon: '⤢', toggleTitle: 'Expand the shared screen' }
    : { width: 'min(960px, 90vw)', toggleIcon: '⤡', toggleTitle: 'Shrink the shared screen so you can see the game' }
}

const SURFACE_BUTTON = {
  border: 'none',
  borderRadius: 4,
  padding: '2px 6px',
  color: '#fff',
  background: 'rgba(0,0,0,0.6)',
  font: '600 14px/1 system-ui, sans-serif',
  cursor: 'pointer',
} as const

// The focused share surface (#489): the sharer's screen, large, above the strip.
// `contain`, not `cover` — a screen must stay legible edge to edge.
function ShareSurface({ share }: { share: ScreenShare }) {
  const ref = useRef<HTMLVideoElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [minimized, setMinimized] = useState(false)
  useAttach(ref, share.focused?.video ?? null)
  if (!share.focused) return null
  const v = surfaceView(minimized)
  return (
    <div ref={box} style={{ position: 'relative', width: v.width, aspectRatio: '16 / 9', background: '#000', borderRadius: 8, overflow: 'hidden' }}>
      <video ref={ref} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      <span style={{ position: 'absolute', left: 8, bottom: 8, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 6px', font: '600 12px/1 system-ui, sans-serif' }}>
        {shareView(share).caption}
      </span>
      <div style={{ position: 'absolute', right: 4, top: 4, display: 'flex', gap: 4 }}>
        <button type="button" title={v.toggleTitle} onClick={() => setMinimized(!minimized)} style={SURFACE_BUTTON}>
          {v.toggleIcon}
        </button>
        {!minimized && (
          <button
            type="button"
            title="View the shared screen fullscreen (Esc exits)"
            // ponytail: native fullscreen — Esc/browser chrome handle the exit; guarded, jsdom has no requestFullscreen
            onClick={() => void box.current?.requestFullscreen?.().catch(() => {})}
            style={SURFACE_BUTTON}
          >
            ⛶
          </button>
        )}
      </div>
    </div>
  )
}

const TONE_BG: Record<CameraTone, string> = {
  on: '#2d7d46', // green — you are sharing video
  off: '#555',
  denied: '#7a5c00',
}

function ControlButton(props: {
  icon: string
  label: string
  bg: string
  clickable: boolean
  pressed: boolean
  title: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={props.clickable ? props.onClick : undefined}
      title={props.title}
      aria-pressed={props.pressed}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        borderRadius: 999,
        padding: '6px 12px',
        color: '#fff',
        background: props.bg,
        font: '600 12px/1 system-ui, sans-serif',
        cursor: props.clickable ? 'pointer' : 'default',
      }}
    >
      <span aria-hidden style={{ fontSize: 14 }}>
        {props.icon}
      </span>
      <span>{props.label}</span>
    </button>
  )
}

// The self-view tile: attaches the local camera track to a muted <video> while
// the camera is on, detaching it when the track goes away (off / left the room).
function SelfView() {
  const s = useSyncExternalStore(meetingState.subscribe, meetingState.get, meetingState.get)
  const ref = useRef<HTMLVideoElement>(null)
  useAttach(ref, s.selfView)

  return (
    <div
      style={{
        width: 160,
        height: 90,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {s.selfView ? (
        <video
          ref={ref}
          autoPlay
          muted
          playsInline
          // Mirror the self-view, the way every video call does.
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
      ) : (
        <span style={{ color: '#888', font: '600 12px/1 system-ui, sans-serif' }}>Camera off</span>
      )}
    </div>
  )
}

// One remote face. A live <video> when their camera is on (attached like the
// self-view), a name-initial placeholder when off; a green ring marks the active
// speaker. Fixed size — the strip scrolls rather than shrinking the tiles (#488).
function RemoteFace({ tile }: { tile: RemoteTile }) {
  const ref = useRef<HTMLVideoElement>(null)
  const v = tileView(tile)
  useAttach(ref, tile.video)

  return (
    <div
      title={tile.name}
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 112,
        height: 63,
        borderRadius: 6,
        overflow: 'hidden',
        background: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        outline: v.ring ? '3px solid #4ade80' : 'none',
        outlineOffset: -3,
      }}
    >
      {v.showVideo ? (
        <video
          ref={ref}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ color: '#ccc', font: '600 22px/1 system-ui, sans-serif' }}>{v.initial}</span>
      )}
    </div>
  )
}

// The remote filmstrip: a fixed-height row that scrolls horizontally once the
// tiles overflow its cap width, so the footprint never grows (#488).
function RemoteTiles() {
  const s = useSyncExternalStore(meetingState.subscribe, meetingState.get, meetingState.get)
  if (s.participants.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 6, maxWidth: 560, overflowX: 'auto', padding: 1 }}>
      {s.participants.map((t) => (
        <RemoteFace key={t.id} tile={t} />
      ))}
    </div>
  )
}

export default function MeetingHud() {
  const meeting = useSyncExternalStore(meetingState.subscribe, meetingState.get, meetingState.get)
  const mic = useSyncExternalStore(micState.subscribe, micState.get, micState.get)
  if (!meeting.inRoom) return null // only while you stand in a meeting room

  const cam = cameraView(meeting.camera)
  const m = micView(mic)
  const sh = shareView(meeting.share)
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        background: 'rgba(0,0,0,0.55)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
      }}
    >
      <ShareSurface share={meeting.share} />
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', maxWidth: '90vw' }}>
        <SelfView />
        <RemoteTiles />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <ControlButton
          icon={m.icon}
          label={m.label}
          bg={m.tone === 'live' ? '#c0392b' : m.tone === 'idle' ? '#2d7d46' : '#555'}
          clickable={m.clickable}
          pressed={mic.muted}
          title={m.hint ?? (mic.muted ? 'Click to unmute' : 'Click to mute')}
          onClick={micState.toggle}
        />
        <ControlButton
          icon={cam.icon}
          label={cam.label}
          bg={TONE_BG[cam.tone]}
          clickable={cam.clickable}
          pressed={meeting.camera === 'on'}
          title={cam.hint ?? (meeting.camera === 'on' ? 'Click to turn the camera off' : 'Click to turn the camera on')}
          onClick={meetingState.toggleCamera}
        />
        <ControlButton
          icon="🖥️"
          label={sh.label}
          bg={meeting.share.mine ? '#2d7d46' : '#555'}
          clickable
          pressed={meeting.share.mine}
          title={meeting.share.mine ? 'Click to stop sharing your screen' : 'Click to share a screen or window'}
          onClick={meetingState.toggleShare}
        />
      </div>
    </div>
  )
}
