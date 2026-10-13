import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import { DiscordSDK } from '@discord/embedded-app-sdk'
import { signIn } from './discord/signIn'
import { guildMapSlug } from './discord/guildMap'
import { mapPresence } from './discord/presence'
import { connectPresence } from './game-session/presenceClient.ts'
import { connectDiscordMeetings } from './discord/meetingMove'
import { bootMapGame } from './game/phaser/mapGame.ts'
import { MapsService } from './maps/service.ts'
import { loadMapInputs } from './maps/target.ts'
import { loadManifestById, loadMyManifest } from './character/service.ts'
import { runEdge } from './lib/runEdge.ts'
import type { BakedMap } from './kernel/schema.ts'

// The Discord Activity's composition root (ADR-0022, #568) — the second shell,
// sibling of MapPage. It lives at src/ root and in the SHELL group (see
// .dependency-cruiser.cjs) so it can boot the game black box the same way
// MapPage does; the discord-shell rule keeps it off auth/, voice/ and the web
// shell. Discord-specific helpers live in src/discord/.
//
// This is a THIRD map-entry path (AGENTS.md "Two map-entry paths"): it loads
// through loadMapInputs and boots through bootMapGame, the same two helpers as
// MapPage, so a new per-target or session input reaches it too.

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string

type Boot = { map: BakedMap; manifest: unknown; guildId: string } & Awaited<ReturnType<typeof loadMapInputs>>
type State =
  | { kind: 'loading' }
  | { kind: 'notSetUp' }
  | { kind: 'ready'; boot: Boot }
  | { kind: 'error'; message: string }

export default function DiscordShell() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const hostRef = useRef<HTMLDivElement>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    // `new DiscordSDK` throws outside Discord (no instance_id) — construct here
    // so the failure lands in the error screen, not a blank page.
    Promise.resolve()
      .then(async () => {
        const sdk = new DiscordSDK(CLIENT_ID)
        await signIn(sdk, CLIENT_ID)
        // One map per server (plan decision 2/6).
        const slug = await guildMapSlug(sdk.guildId)
        if (!slug) return setState({ kind: 'notSetUp' })
        const [map, manifest] = await Promise.all([
          runEdge(MapsService.get(slug)),
          loadMyManifest().catch(() => null),
        ])
        setState({ kind: 'ready', boot: { map, manifest, guildId: sdk.guildId as string, ...(await loadMapInputs(map)) } })
      })
      .catch((e: unknown) => setState({ kind: 'error', message: String((e as Error)?.message ?? e) }))
  }, [])

  const boot = state.kind === 'ready' ? state.boot : null
  useEffect(() => {
    if (!boot || !hostRef.current) return undefined
    const presence = mapPresence(boot.map, boot.ownId, boot.ownName, connectPresence, loadManifestById)
    const game = bootMapGame(
      hostRef.current,
      // CANVAS: Discord's webview never composites WebGL (spike lesson).
      { type: Phaser.CANVAS, manifest: boot.manifest, npcs: boot.npcs },
      {
        map: boot.map,
        objects: boot.objects,
        bakedNpcs: boot.bakedNpcs,
        // Standees are out of v1 (plan decision 6): nobody here renders the
        // Placard panel, and an unanswered press-A would freeze input.
        bakedStandees: [],
        entrySpawnId: undefined,
        fromSlug: undefined,
        // No onZone — portals/links/encounters are cut from v1.
        presence,
        // Meeting zones move you to their Discord voice channel (#571).
        voice: connectDiscordMeetings({ guildId: boot.guildId, zones: boot.map.zones ?? [], notify: setNotice }),
      },
    )
    return () => {
      presence?.disconnect()
      game.destroy(true)
    }
  }, [boot])

  if (state.kind === 'loading') return <p>Signing in with Discord…</p>
  if (state.kind === 'notSetUp') return <p role="status">This server is not set up yet.</p>
  if (state.kind === 'error') return <p role="alert">Could not load: {state.message}</p>
  return (
    <>
      <div ref={hostRef} style={{ position: 'fixed', inset: 0, background: '#000' }} />
      {notice && (
        <p
          role="status"
          style={{ position: 'fixed', top: 12, left: 12, right: 12, margin: 0, padding: '8px 12px', textAlign: 'center',
            color: '#fff', background: 'rgba(0,0,0,0.75)', borderRadius: 6, font: '14px system-ui, sans-serif' }}
        >
          {notice}
        </p>
      )}
    </>
  )
}
