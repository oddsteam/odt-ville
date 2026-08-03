import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Phaser from 'phaser'
import MapScene from './game/phaser/scenes/MapScene.js'
import EncounterScene from './game/phaser/scenes/EncounterScene.js'
import { trainerOpponent } from './game/phaser/trainerDuel.ts'
import { MapsService, takeDraft, travel } from './maps/service.ts'
import { loadMapBundle } from './maps/target.ts'
import { applyMapTarget } from './kernel/mapTarget.ts'
import { warp } from './game/transition.ts'
import { MonstersService } from './catalog/monsters/service.ts'
import { NpcsService } from './catalog/npcs/service.ts'
import { pickWild, wildStepGate } from './game/encounters.js'
import { runEdge } from './lib/runEdge.ts'
import { subscribeAuthToken } from './lib/authToken.ts'
import { connectPresence } from './lib/presenceClient.ts'
import { connectVoice } from './voice/mesh.ts'
import { ViewerService } from './viewer/service.ts'
import { loadManifestById, loadMyManifest } from './character/service.ts'
import type { BakedMap, Zone } from './kernel/schema.ts'
import type { Npc } from './catalog/npcs/schema.ts'

// Play surface for an authored map (ADR-0004). It loads a baked map by slug and
// boots Phaser with the map-agnostic MapScene — the runtime renders "the
// current map" without knowing which one. This is the same black-box discipline
// as the village page; the only producer-specific thing is the loader: with
// `draft` (the editor's preview-in-game handoff, #91) the document comes out
// of storage through the same schema instead of GET /maps/:slug — everything
// downstream is identical, so walk-testing exercises the real runtime.
export default function MapPage({ draft = false }: { draft?: boolean }) {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  // A portal arrival names its entry spawn via route state (#84); direct
  // navigation carries none and the scene falls back to the grid centre. A ref
  // (like the manifest/objects below) so the boot effect keys on the loaded map
  // alone — route state flips before the target map arrives.
  const entrySpawnIdRef = useRef<string | undefined>(undefined)
  entrySpawnIdRef.current = (useLocation().state as { entrySpawnId?: string } | null)?.entrySpawnId
  const hostRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<BakedMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The last fired zone's behaviour notice (#85) — sticky until the next fire.
  const [zoneNotice, setZoneNotice] = useState<string | null>(null)
  // Bumped by the dev switcher so the load re-runs after the active user
  // changes — the first paint fetches before a user is picked and 401s.
  const [reloadKey, setReloadKey] = useState(0)

  // The user's character manifest (#155) rides along with the map load so it
  // is already in hand when Phaser boots (loadMyManifest owns its own
  // fallback chain and never throws — null means the bundled fallback frames).
  const manifestRef = useRef<unknown>(null)
  // The tile objects the map's entities reference (ADR-0008), batch-fetched
  // (#138) after the map so the shared loader has their images at boot.
  const objectsRef = useRef<unknown>([])
  // The NPC catalog (#259) — identity + sprite for a trainer Zone's duel,
  // fetched with the map so the dispatch can resolve a fired npcId. Best-effort
  // (a missing endpoint leaves it empty and a trainer zone challenges nobody).
  const npcsRef = useRef<readonly Npc[]>([])
  // The rigs the map's placed NPCs draw from (#294) — resolved shell-side and
  // handed to the shared renderer through the registry, like `bakedObjects`.
  const npcRigsRef = useRef<readonly { id: number; manifest: unknown }[]>([])
  // The Standees standing on the map (#369, ADR-0015), each with its owner's rig
  // resolved by reference — handed to the runtime through the registry like the
  // NPC rigs. Empty on solo maps (Standees live on multiplayer maps only).
  const standeesRef = useRef<readonly unknown[]>([])
  // The viewer's stable Keycloak id (#88) — presence filters its own echoed
  // frames by it. Only fetched for multiplayer maps; null keeps presence off.
  const ownIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!slug && !draft) return
    // Arriving on a map (portal travel included) starts with a clean notice bar;
    // a refusal never navigates, so its notice survives this.
    setZoneNotice(null)
    let active = true
    Promise.all([
      // The draft route has no slug — the document was stashed by the editor.
      // Resolve inside the chain so a contract-breaking draft lands in catch.
      draft
        ? Promise.resolve().then(() => takeDraft())
        : runEdge(MapsService.get(slug!)),
      loadMyManifest().catch(() => null),
    ])
      .then(async ([m, manifest]) => {
        if (!m) throw new Error('No draft to preview — use "Preview in game" in the editor.')
        const npcs = await runEdge(NpcsService.list()).catch(() => [] as readonly Npc[])
        // Objects + placed-NPC rigs assembled by the shared helper (#303), the
        // same bundle the portal path loads.
        const { objects, bakedNpcs, bakedStandees } = await loadMapBundle(m, npcs)
        const viewer = m.multiplayer ? await runEdge(ViewerService.get()).catch(() => null) : null
        if (!active) return
        ownIdRef.current = viewer?.user.external_id ?? null
        manifestRef.current = manifest
        objectsRef.current = objects
        npcsRef.current = npcs
        npcRigsRef.current = bakedNpcs
        standeesRef.current = bakedStandees
        setMap(m)
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [slug, draft, reloadKey])

  useEffect(
    () => subscribeAuthToken(() => {
      setError(null)
      setReloadKey((k) => k + 1)
    }),
    [],
  )

  // Boot Phaser once the baked map is loaded. The map goes into the registry as
  // `bakedMap` so MapScene reads it in preload(), the same boot-input timing the
  // town scene uses for its catalog.
  useEffect(() => {
    if (!map || !hostRef.current) return undefined
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: map.cols * 48,
      height: map.rows * 48,
      backgroundColor: '#5fc24a',
      pixelArt: true,
      antialias: false,
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      // EncounterScene rides alongside the map so a trainer Zone (#259) can duel
      // in place; it launches paused over MapScene and resumes 'Map' on close.
      scene: [MapScene, EncounterScene],
    })
    // Session-stable inputs for this fresh game (the town keeps these across
    // hops; here each map boots its own game, so set them once at boot).
    game.registry.set('characterManifest', manifestRef.current)
    game.registry.set('npcs', npcsRef.current)
    // Presence (#88): a multiplayer map opens its per-map room; solo maps —
    // and the generated hometown, which never renders through this page —
    // stay offline. The handle rides the registry like onZone: the scene
    // renders peers and broadcasts steps, the shell owns the wire.
    const presence = map.multiplayer && ownIdRef.current ? connectPresence(map.slug) : null
    // Proximity voice (#280): mesh WebRTC audio to pod peers, driven by the same
    // roster MapScene renders. Explicit guard — a solo map, and the generated
    // hometown (no Maps::Map row, so never `multiplayer`), open no voice; media
    // is P2P and never touches the app server. Injected via the registry like
    // presence, so the game imports no voice code (ADR-0004, arch rule #278).
    const voice =
      map.multiplayer && ownIdRef.current ? connectVoice(map.slug, ownIdRef.current) : null
    // The per-target keys in one place (#303), shared with the portal path.
    // `loadManifest` rides the presence bundle (#266): frames name their
    // sender's character and the scene asks for it through here.
    applyMapTarget(game.registry, {
      map,
      objects: objectsRef.current,
      bakedNpcs: npcRigsRef.current,
      bakedStandees: standeesRef.current,
      entrySpawnId: entrySpawnIdRef.current,
      presence: presence
        ? { ownId: ownIdRef.current, loadManifest: loadManifestById, ...presence }
        : null,
      voice,
    })
    // Encounter zones fire per landing step (#255); this gate owns the roll
    // rate and the post-encounter grace for this game's lifetime.
    const grassGate = wildStepGate()
    // The one event channel out of the game (#85): the scene fires every zone
    // event through here; the shell dispatches on payload.kind — exhaustive by
    // type, the way `house.type` maps to a detail component (ADR-0004/0005).
    // `portal` is travel (#84): the target is loaded before leaving, then the
    // route change tears this game down and boots the next map — exactly one
    // loaded at a time. A denied target refuses via the notice bar and the
    // avatar (and the portal) stay where they are. `link` (#110) opens the
    // external page in a new tab — the game keeps running behind it.
    game.registry.set('onZone', (_trigger: Zone['trigger'], zone: Zone) => {
      const p = zone.payload
      switch (p.kind) {
        case 'portal':
          void travel(p, {
            load: (s) => runEdge(MapsService.get(s)),
            go: (s, spawn) =>
              void warp(() => navigate(`/maps/${s}`, { state: { entrySpawnId: spawn } })),
            refuse: setZoneNotice,
          })
          return
        case 'link':
          window.open(p.url, '_blank', 'noopener')
          return
        case 'trainer': {
          // The sight cone fired (#86): resolve the NPC and duel in place. An
          // unset/dangling npcId resolves to null and starts nothing (the map
          // stays put), so a map with no real trainer challenges nobody.
          const opponent = trainerOpponent(npcsRef.current, p.npcId)
          if (!opponent) return
          const mapScene = game.scene.getScene('Map')
          if (!mapScene) return
          mapScene.scene.pause()
          mapScene.scene.launch('Encounter', { opponent, worldScene: 'Map' })
          return
        }
        case 'encounter': {
          // A grass step (#87/#255): the shared per-step gate rolls the GB rate
          // (+ grace after a launch); on a hit, fetch the named pool live and
          // roll a wild through the shared pickWild (its #69 fallback keeps the
          // grass alive when the pool is empty). The fetch is the shell's job —
          // the game never imports a data service (ADR-0004) — so an empty slug
          // asks for the whole global pool. A failed fetch quietly rolls nothing.
          if (!grassGate()) return
          void runEdge(MonstersService.pool(p.pool || undefined))
            .then((rows) => {
              const mapScene = game.scene.getScene('Map')
              if (!mapScene) return
              mapScene.scene.pause()
              mapScene.scene.launch('Encounter', { opponent: pickWild(rows), worldScene: 'Map' })
            })
            .catch(() => {})
          return
        }
        // Mirrors villageZone's guard: the two shells dispatch the same
        // ZonePayload contract, so a new kind must fail the build in both
        // rather than land in one and go quiet in the other (#87 did exactly
        // that — `encounter` here, nothing in the village).
        default: {
          const unhandled: never = p
          return unhandled
        }
      }
    })
    return () => {
      presence?.disconnect()
      game.destroy(true)
    }
  }, [map, navigate])

  if (error) {
    return (
      <div className="error-card">
        <h2>CAN'T REACH THE MAP</h2>
        <p className="error-detail">{error}</p>
      </div>
    )
  }

  return (
    <div className="village-map">
      <div className="gb-shell">
        <div className="gb-topbar">
          <span className="gb-led" />
          <span className="gb-topbar-label">{map?.title || 'LOADING…'}</span>
          <span className="gb-topbar-tag">GAME BOY</span>
        </div>
        <div className="gb-screen">
          <div className="phaser-host" ref={hostRef} />
        </div>
        {zoneNotice && <div className="gb-topbar">{zoneNotice}</div>}
      </div>
    </div>
  )
}
