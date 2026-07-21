import { useEffect, useState } from 'react'

// Test-env voice meter (#287): one bar per peer whose inbound voice is arriving,
// its width tracking their live audio level — so you can SEE another player's
// voice reach you without needing to hear it (headphones off, or just to prove
// the mesh works). It taps the same window.__voice.received seam the #280 e2e
// reads, so the game and the voice wire stay untouched.
//
// Opt-in: add ?voicemeter to the URL. That works on the homeserver's prod build
// too — where two-user testing actually happens — and stays invisible to
// everyone else. App mounts it only when the flag is present.

// Time-domain RMS of one analyser frame → 0..1. ponytail: the /64 scale is a
// sensitivity knob (full-scale sine ≈ 0.7 before it), not a calibrated dB; bump
// it if quiet speech barely moves the bar. No smoothing/peak-hold — this is a
// liveness check, not a VU meter.
export function level(buf: Uint8Array): number {
  let sum = 0
  for (const v of buf) {
    const d = v - 128
    sum += d * d
  }
  return Math.min(1, Math.sqrt(sum / buf.length) / 64)
}

export default function VoiceMeters() {
  const [levels, setLevels] = useState<[string, number][]>([])

  useEffect(() => {
    // Confirm the overlay is live in DevTools — disambiguates "flag off / stale
    // bundle" from "flag on, just no peer streaming yet".
    console.info('[voicemeter] mounted — waiting for peer audio (needs a 2nd player in a multiplayer map)')
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return undefined
    const ctx = new AC()
    // One analyser per peer, rewired if that peer's stream identity changes
    // (leave/rejoin). Reconciled against window.__voice.received every frame.
    const taps = new Map<string, { stream: MediaStream; analyser: AnalyserNode }>()
    let raf = 0
    const tick = () => {
      const received = window.__voice?.received
      const next: [string, number][] = []
      if (received) {
        for (const [id, stream] of received) {
          let tap = taps.get(id)
          if (!tap || tap.stream !== stream) {
            const analyser = ctx.createAnalyser()
            ctx.createMediaStreamSource(stream).connect(analyser)
            tap = { stream, analyser }
            taps.set(id, tap)
          }
          const buf = new Uint8Array(tap.analyser.frequencyBinCount)
          tap.analyser.getByteTimeDomainData(buf)
          next.push([id, level(buf)])
        }
      }
      for (const id of taps.keys()) if (!received?.has(id)) taps.delete(id)
      setLevels(next)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      void ctx.close()
    }
  }, [])

  // Always render when mounted (App mounts this only behind ?voicemeter), so the
  // flag being live is visible even before any peer streams — the header is the
  // "it's on" confirmation; peer bars fill in once a 2nd player is in earshot.
  return (
    <div
      style={{
        position: 'fixed',
        left: 8,
        bottom: 8,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        pointerEvents: 'none',
        fontFamily: 'monospace',
        fontSize: 10,
      }}
    >
      <span style={{ color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: 2 }}>
        🎙 voice meter{levels.length === 0 ? ' · waiting for peers…' : ''}
      </span>
      {levels.map(([id, value]) => (
        <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#fff' }}>
          <span style={{ opacity: 0.7 }}>🎤 {id.slice(0, 6)}</span>
          <div style={{ width: 120, height: 10, background: 'rgba(0,0,0,0.5)', borderRadius: 2, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.round(value * 100)}%`,
                height: '100%',
                background: '#5fc24a',
                transition: 'width 60ms linear',
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
