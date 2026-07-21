import { useSyncExternalStore } from 'react'
import { micState, type MicSnapshot } from './micState.ts'

// Mic consent + mute affordance (#282). #280 shipped a hot mic: walk near
// someone and you transmit, with no sign it is happening and no way to stop.
// This overlay is that sign — always on when voice is (multiplayer maps) — and
// its click is the stop. It reads the one live mesh via micState; the mesh does
// the track-level muting. Hidden entirely when no mesh is up (hometown, solo).

export type MicTone = 'live' | 'muted' | 'idle' | 'denied'
export interface MicView {
  icon: string
  label: string
  tone: MicTone
  clickable: boolean
  hint?: string
}

// State → what the player sees. muted wins over live so a muted player is never
// told they are transmitting; denied is terminal (nothing to click).
export function micView(s: MicSnapshot): MicView {
  if (s.denied)
    return {
      icon: '🚫',
      label: 'Mic blocked',
      tone: 'denied',
      clickable: false,
      hint: 'Allow the microphone in your browser to talk.',
    }
  if (s.muted) return { icon: '🔇', label: 'Muted', tone: 'muted', clickable: true }
  if (s.live) return { icon: '🎙️', label: 'Live', tone: 'live', clickable: true }
  return { icon: '🎤', label: 'Mic on', tone: 'idle', clickable: true }
}

const TONE_BG: Record<MicTone, string> = {
  live: '#c0392b', // red — you are being heard
  muted: '#555',
  idle: '#2d7d46',
  denied: '#7a5c00',
}

export default function MicIndicator() {
  const s = useSyncExternalStore(micState.subscribe, micState.get, micState.get)
  if (!s.active) return null // no voice on this map — nothing to show or stop

  const v = micView(s)
  return (
    <button
      type="button"
      onClick={v.clickable ? micState.toggle : undefined}
      title={v.hint ?? (s.muted ? 'Click to unmute' : 'Click to mute')}
      aria-pressed={s.muted}
      style={{
        position: 'fixed',
        // Just below the app header's top-right, right-aligned under the Log out
        // button (header padding is 16px). ponytail: fixed 52px clears the
        // compact header; if it ever wraps to two rows on a very narrow window
        // the pill can overlap — move it into the header cluster then.
        top: 52,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: 'none',
        borderRadius: 999,
        padding: '6px 12px',
        color: '#fff',
        background: TONE_BG[v.tone],
        font: '600 12px/1 system-ui, sans-serif',
        cursor: v.clickable ? 'pointer' : 'default',
        boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      <span
        aria-hidden
        style={{
          fontSize: 14,
          // A live mic pulses so it reads as active, not a static badge.
          animation: v.tone === 'live' ? 'micPulse 1.2s ease-in-out infinite' : undefined,
        }}
      >
        {v.icon}
      </span>
      <span>{v.label}</span>
      <style>{'@keyframes micPulse{0%,100%{opacity:1}50%{opacity:0.35}}'}</style>
    </button>
  )
}
