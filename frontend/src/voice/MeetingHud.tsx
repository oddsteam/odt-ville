import { useEffect, useRef, useSyncExternalStore } from 'react'
import { meetingState, type CameraStatus } from './meetingState.ts'
import { micState } from './micState.ts'
import { micView } from './MicIndicator.tsx'

// The meeting overlay (#487). While you stand in a meeting room (#486) this is
// your mic + camera controls and your own self-view; walking out tears it down.
// It reads the two singleton stores (meetingState / micState) and renders only
// your own tile — remote faces are a later slice. The camera is off on entry,
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
  useEffect(() => {
    const el = ref.current
    const track = s.selfView
    if (!el || !track) return
    track.attach(el)
    return () => void track.detach()
  }, [s.selfView])

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

export default function MeetingHud() {
  const meeting = useSyncExternalStore(meetingState.subscribe, meetingState.get, meetingState.get)
  const mic = useSyncExternalStore(micState.subscribe, micState.get, micState.get)
  if (!meeting.inRoom) return null // only while you stand in a meeting room

  const cam = cameraView(meeting.camera)
  const m = micView(mic)
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
      <SelfView />
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
      </div>
    </div>
  )
}
