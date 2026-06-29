import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Phaser from 'phaser'
import MapScene from '../game/phaser/scenes/MapScene.js'
import { MapsService } from './service.ts'
import { runEdge } from '../lib/runEdge.ts'
import type { BakedMap } from './schema.ts'

// Play surface for an authored map (ADR-0004). It loads a baked map by slug and
// boots Phaser with the map-agnostic MapScene — the runtime renders "the
// current map" without knowing which one. This is the same black-box discipline
// as the village page; the only producer-specific thing is the loader.
export default function MapPage() {
  const { slug } = useParams<{ slug: string }>()
  const hostRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<BakedMap | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    let active = true
    runEdge(MapsService.get(slug))
      .then((m) => active && setMap(m))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      active = false
    }
  }, [slug])

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
