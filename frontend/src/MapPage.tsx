import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Phaser from 'phaser'
import MapScene from './game/phaser/scenes/MapScene.js'
import EncounterScene from './game/phaser/scenes/EncounterScene.js'
import { trainerOpponent } from './game/phaser/trainerDuel.ts'
import { MapsService, travel } from './maps/service.ts'
import { TileObjectsService } from './catalog/tileObjects/service.ts'
import { NpcsService } from './catalog/npcs/service.ts'
import { objectIdsFrom } from './maps/props.ts'
import { runEdge } from './lib/runEdge.ts'
import { subscribeAuthToken } from './lib/authToken.ts'
import { loadMyManifest } from './character/service.ts'
import type { BakedMap, Zone } from './kernel/schema.ts'
import type { Npc } from './catalog/npcs/schema.ts'

// Play surface for an authored map (ADR-0004). It loads a baked map by slug and
// boots Phaser with the map-agnostic MapScene — the runtime renders "the
// current map" without knowing which one. This is the same black-box discipline
// as the village page; the only producer-specific thing is the loader.
export default function MapPage() {
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

  useEffect(() => {
    if (!slug) return
    // Arriving on a map (portal travel included) starts with a clean notice bar;
    // a refusal never navigates, so its notice survives this.
    setZoneNotice(null)
    let active = true
    Promise.all([
      runEdge(MapsService.get(slug)),
      loadMyManifest().catch(() => null),
    ])
      .then(async ([m, manifest]) => {
        const objects = await runEdge(TileObjectsService.getMany(objectIdsFrom(m.entities)))
        const npcs = await runEdge(NpcsService.list()).catch(() => [] as readonly Npc[])
        if (!active) return
        manifestRef.current = manifest
        objectsRef.current = objects
        npcsRef.current = npcs
        setMap(m)
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [slug, reloadKey])

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
    game.registry.set('bakedMap', map)
    game.registry.set('bakedObjects', objectsRef.current)
    game.registry.set('characterManifest', manifestRef.current)
    game.registry.set('entrySpawnId', entrySpawnIdRef.current)
    game.registry.set('npcs', npcsRef.current)
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
            go: (s, spawn) => navigate(`/maps/${s}`, { state: { entrySpawnId: spawn } }),
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
        }
      }
    })
    return () => {
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
