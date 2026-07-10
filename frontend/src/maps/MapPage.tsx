import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Phaser from 'phaser'
import MapScene from '../game/phaser/scenes/MapScene.js'
import { MapsService } from './service.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { objectIdsFrom } from './props.ts'
import { runEdge } from '../lib/runEdge.ts'
import { subscribeAuthToken } from '../lib/authToken.ts'
import { loadActiveManifest } from '../character/manifest.js'
import type { BakedMap } from '../kernel/schema.ts'

// Play surface for an authored map (ADR-0004). It loads a baked map by slug and
// boots Phaser with the map-agnostic MapScene — the runtime renders "the
// current map" without knowing which one. This is the same black-box discipline
// as the village page; the only producer-specific thing is the loader.
export default function MapPage() {
  const { slug } = useParams<{ slug: string }>()
  const hostRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<BakedMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped by the dev switcher so the load re-runs after the active user
  // changes — the first paint fetches before a user is picked and 401s.
  const [reloadKey, setReloadKey] = useState(0)

  // The active character manifest rides along with the map load so it is
  // already in hand when Phaser boots (loadActiveManifest owns its own
  // fallback chain and never throws — null means the bundled fallback frames).
  const manifestRef = useRef<unknown>(null)
  // The tile objects the map's entities reference (ADR-0008), batch-fetched
  // (#138) after the map so the shared loader has their images at boot.
  const objectsRef = useRef<unknown>([])

  useEffect(() => {
    if (!slug) return
    let active = true
    Promise.all([
      runEdge(MapsService.get(slug)),
      loadActiveManifest().catch(() => null),
    ])
      .then(async ([m, manifest]) => {
        const objects = await runEdge(TileObjectsService.getMany(objectIdsFrom(m.entities)))
        if (!active) return
        manifestRef.current = manifest
        objectsRef.current = objects
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
      scene: [MapScene],
    })
    game.registry.set('bakedMap', map)
    game.registry.set('bakedObjects', objectsRef.current)
    game.registry.set('characterManifest', manifestRef.current)
    return () => {
      game.destroy(true)
    }
  }, [map])

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
      </div>
    </div>
  )
}
