import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import PlaceholderScene from './scenes/PlaceholderScene.js'

// PR-A bootstrap. <PhaserGame> is the React-side host for the Phaser game
// instance — it does nothing more than:
//   1. Create a div Phaser can paint into.
//   2. On mount, instantiate Phaser.Game with our scene list.
//   3. On unmount, destroy the game cleanly so HMR / scene swaps don't leak.
//
// The black-box boundary stays at <VillageGame> one level up — PhaserGame
// only knows how to host Phaser, not what the game *means*. PR-B+ will
// thread props (communities, session, ...) into the scenes via Phaser's
// registry / event bus; for the placeholder there is nothing to thread.

// Design resolution matches today's DOM town for a 5-community seed
// (24 cols × 19 rows × 48 px = 1152 × 912). Phaser's Scale.FIT keeps that
// aspect ratio inside whatever box the GB shell gives us.
const DESIGN_WIDTH = 1152
const DESIGN_HEIGHT = 912

export default function PhaserGame() {
  const hostRef = useRef(null)
  const gameRef = useRef(null)

  useEffect(() => {
    if (!hostRef.current) return undefined

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      backgroundColor: '#cfa974',
      pixelArt: true,
      antialias: false,
      // FIT preserves the design's aspect ratio inside the host element —
      // the canvas grows / shrinks with the GB screen, never stretches.
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
      },
      scene: [PlaceholderScene],
    })
    gameRef.current = game

    return () => {
      // Tear the game down so the canvas + listeners go away when the
      // engine is hot-swapped or the village tab is unmounted. The
      // `true` removes the canvas element from the DOM.
      game.destroy(true)
      gameRef.current = null
      if (typeof window !== 'undefined' && window.__game) {
        // Strict mode and HMR remount the host; clear the shared
        // test-API marker so stale scenes can't be inspected.
        delete window.__game
      }
    }
  }, [])

  return <div className="phaser-host" ref={hostRef} />
}
