import { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import TownScene from './scenes/TownScene.js'
import InteriorScene from './scenes/InteriorScene.js'
import bus from './bus.js'

// Player walks — imported here so Vite emits hashed URLs at build time and
// the Phaser loader can fetch each direction's frames.
import frontStill from '../assets/character/front-still.png'
import frontWalk1 from '../assets/character/front-walk-1.png'
import frontWalk2 from '../assets/character/front-walk-2.png'
import frontWalk3 from '../assets/character/front-walk-3.png'
import backStill from '../assets/character/back-still.png'
import backWalk1 from '../assets/character/back-walk-1.png'
import backWalk2 from '../assets/character/back-walk-2.png'
import backWalk3 from '../assets/character/back-walk-3.png'
import leftStill from '../assets/character/left-still.png'
import leftWalk1 from '../assets/character/left-walk-1.png'
import leftWalk2 from '../assets/character/left-walk-2.png'
import leftWalk3 from '../assets/character/left-walk-3.png'
import rightStill from '../assets/character/right-still.png'
import rightWalk1 from '../assets/character/right-walk-1.png'
import rightWalk2 from '../assets/character/right-walk-2.png'
import rightWalk3 from '../assets/character/right-walk-3.png'
import roofImg from '../assets/buildings/guild-roof.png'
import bodyImg from '../assets/buildings/guild-body.png'

// Asset URLs collected in one bag so TownScene's preload() can pull them
// from the registry without importing them itself (keeping the scene file
// portable to other shells in the future).
const ASSETS = {
  player: {
    down: [frontStill, frontWalk1, frontWalk2, frontWalk3],
    up: [backStill, backWalk1, backWalk2, backWalk3],
    left: [leftStill, leftWalk1, leftWalk2, leftWalk3],
    right: [rightStill, rightWalk1, rightWalk2, rightWalk3],
  },
  buildings: {
    roofUrl: roofImg,
    bodyUrl: bodyImg,
  },
}

// Design resolution matches the DOM town for a 5-community seed
// (24 cols × 19 rows × 48 px = 1152 × 912). Phaser's Scale.FIT keeps that
// aspect ratio inside whatever box the GB shell gives us; TownScene
// resizes the world bounds for larger towns at runtime.
const DESIGN_WIDTH = 1152
const DESIGN_HEIGHT = 912

// PR-C host. Mounts a Phaser game, pushes React props into the game's
// registry, and forwards bus events back to the parent via callback
// props. The Phaser game survives prop changes — the scene listens on
// the registry and reacts there.
export default function PhaserGame({
  communities,
  session,
  onEnterCommunity,
  onExitCommunity,
  onOpenBoard,
}) {
  const hostRef = useRef(null)
  const gameRef = useRef(null)

  // The callback-ref pattern lets us avoid re-subscribing to the bus on
  // every render — listeners read the latest callback through the ref.
  const enterCommunityRef = useRef(onEnterCommunity)
  enterCommunityRef.current = onEnterCommunity
  const exitCommunityRef = useRef(onExitCommunity)
  exitCommunityRef.current = onExitCommunity
  const openBoardRef = useRef(onOpenBoard)
  openBoardRef.current = onOpenBoard

  // Phaser instantiation — once per mount. Subsequent prop changes are
  // pushed via registry updates in the next effects, not by recreating
  // the game.
  useEffect(() => {
    if (!hostRef.current) return undefined

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: DESIGN_WIDTH,
      height: DESIGN_HEIGHT,
      backgroundColor: '#5fc24a',
      pixelArt: true,
      antialias: false,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
      },
      scene: [TownScene, InteriorScene],
    })

    // Seed the registry BEFORE the scene boots so TownScene.create() sees
    // the initial communities + session. Game registry is shared data
    // React can update at runtime via .set().
    game.registry.set('assets', ASSETS)
    game.registry.set('communities', communities)
    game.registry.set('session', session)

    gameRef.current = game

    // Bus subscriptions — one set of listeners per mount, each reading
    // the latest callback from a ref so we don't tear listeners on
    // prop change.
    const onEnter = (id) => enterCommunityRef.current?.(id)
    const onExit = (id) => exitCommunityRef.current?.(id)
    const onOpen = (boardType) => openBoardRef.current?.(boardType)
    bus.on('enterCommunity', onEnter)
    bus.on('exitCommunity', onExit)
    bus.on('openBoard', onOpen)

    return () => {
      bus.off('enterCommunity', onEnter)
      bus.off('exitCommunity', onExit)
      bus.off('openBoard', onOpen)
      game.destroy(true)
      gameRef.current = null
      if (typeof window !== 'undefined' && window.__game) {
        delete window.__game
      }
    }
  }, [])

  // Push prop changes into the registry. Scenes listen for
  // 'changedata-communities' / 'changedata-session' to react.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('communities', communities)
  }, [communities])

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('session', session)
  }, [session])

  return <div className="phaser-host" ref={hostRef} />
}
