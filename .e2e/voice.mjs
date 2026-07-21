// Proximity voice (#280): two fake-device browsers meet on one multiplayer map
// and one hears the other. Chrome's --use-fake-device-for-media-stream feeds
// getUserMedia a synthetic tone, so there is no microphone, no feedback squeal
// and a deterministic non-silent signal to assert on. Two contexts on one
// machine connect on host ICE candidates alone — no STUN, no TURN. The audio is
// peer-to-peer: it rides the RTCPeerConnection, never the app server (only the
// SDP/ICE handshake touches the #279 relay).
//
// Run against the dev stack (docker compose up): node .e2e/voice.mjs
import { chromium } from 'playwright-core'

const APP = 'http://localhost:5460'
const SLUG = process.argv[2] || 'plaza' // a multiplayer Maps::Map
const KEYCLOAK = 'http://localhost:8080/realms/odtville/protocol/openid-connect/token'

// Seeded realm users (keycloak/realm-export.json), both password `dev`.
async function tokenFor(username) {
  const res = await fetch(KEYCLOAK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'odt-ville-web',
      username,
      password: 'dev',
    }),
  })
  if (!res.ok) throw new Error(`Keycloak grant for ${username} failed: ${res.status}`)
  return (await res.json()).access_token
}

// The fake device + auto-granted mic permission; autoplay without a gesture so
// the inbound <audio> element is free to play (the analyser reads the track
// either way, but this keeps the real playback path honest).
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})

async function openPlayer(username) {
  const token = await tokenFor(username)
  const page = await browser.newPage({ viewport: { width: 900, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  await page.addInitScript((t) => sessionStorage.setItem('odtville.devToken', t), token)
  await page.goto(`${APP}/maps/${SLUG}`, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => typeof window.__game?.playerTile === 'function', null, {
    timeout: 15000,
  })
  return { page, errors }
}

// Both spawn on the map centre — same tile, so distance 0 puts each in the
// other's pod the moment presence rosters sync. No walking needed.
const alice = await openPlayer('alice')
const bob = await openPlayer('bob')

// Give presence a beat to exchange positions, then WebRTC time to negotiate
// (offer/answer + host ICE) and start flowing the tone.
await bob.page.waitForFunction(() => (window.__voice?.received.size ?? 0) > 0, null, {
  timeout: 15000,
})

// Non-silent proof: run bob's inbound stream through an AnalyserNode and look
// for a waveform that departs from the 128 (silence) midline. The fake tone
// peaks far above the +/-2 floor; true silence never would.
const result = await bob.page.evaluate(async () => {
  const stream = [...window.__voice.received.values()][0]
  const ac = new AudioContext()
  const analyser = ac.createAnalyser()
  ac.createMediaStreamSource(stream).connect(analyser)
  const buf = new Uint8Array(analyser.fftSize)
  let peak = 0
  for (let i = 0; i < 40; i++) {
    analyser.getByteTimeDomainData(buf)
    for (const s of buf) peak = Math.max(peak, Math.abs(s - 128))
    await new Promise((r) => setTimeout(r, 25))
  }
  await ac.close()
  return { peers: window.__voice.received.size, peak }
})

const errors = [...alice.errors, ...bob.errors]
const ok = result.peers > 0 && result.peak > 2 && errors.length === 0
console.log(JSON.stringify({ slug: SLUG, ...result, errors, ok }, null, 2))

await browser.close()
process.exit(ok ? 0 : 1)
