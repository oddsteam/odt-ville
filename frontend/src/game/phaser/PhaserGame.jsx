import { useEffect, useRef, useState } from 'react'
import Phaser from 'phaser'
import TownScene from './scenes/TownScene.js'
import InteriorScene from './scenes/InteriorScene.js'
import EncounterScene from './scenes/EncounterScene.js'
import MobileDpad from '../MobileDpad.jsx'
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

// Design resolution = the Phaser canvas viewport. Matches the DOM
// engine's .gb-screen size at TILE=48: 18×13 tiles visible. The camera
// scrolls a fixed-size 864×624 viewport through whatever-size world
// the town generated (TownScene's setBounds limits the scroll to the
// world's edges). Same look the user accepted in
// docs/reference/village-view-baseline.png.
const DESIGN_WIDTH = 864
const DESIGN_HEIGHT = 624

// PR-E village shell. Wraps the Phaser canvas in the GB chrome and
// renders the DOM overlay (D-pad / A button / FULL / Daily Brief)
// floating on top of it. The overlay forwards taps + clicks to the
// scenes via the bus so on-screen and keyboard input behave identically.
export default function PhaserGame({
  communities,
  session,
  dailyBrief,
  activeCommunityId,
  onEnterCommunity,
  onExitCommunity,
  onOpenBoard,
  trainerDefeated,
  onTrainerDefeated,
}) {
  const hostRef = useRef(null)
  const shellRef = useRef(null)
  const gameRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const enterCommunityRef = useRef(onEnterCommunity)
  enterCommunityRef.current = onEnterCommunity
  const exitCommunityRef = useRef(onExitCommunity)
  exitCommunityRef.current = onExitCommunity
  const openBoardRef = useRef(onOpenBoard)
  openBoardRef.current = onOpenBoard
  const trainerDefeatedRef = useRef(onTrainerDefeated)
  trainerDefeatedRef.current = onTrainerDefeated

  // Phaser instantiation — once per mount. Prop changes flow via
  // registry updates in later effects, not by recreating the game.
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
      scene: [TownScene, InteriorScene, EncounterScene],
    })

    game.registry.set('assets', ASSETS)
    game.registry.set('communities', communities)
    game.registry.set('session', session)
    game.registry.set('trainerDefeated', Boolean(trainerDefeated))

    gameRef.current = game

    const onEnter = (id) => enterCommunityRef.current?.(id)
    const onExit = (id) => exitCommunityRef.current?.(id)
    const onOpen = (boardType) => openBoardRef.current?.(boardType)
    const onTrainerDefeatedEvent = () => trainerDefeatedRef.current?.()
    bus.on('enterCommunity', onEnter)
    bus.on('exitCommunity', onExit)
    bus.on('openBoard', onOpen)
    bus.on('trainerDefeated', onTrainerDefeatedEvent)

    return () => {
      bus.off('enterCommunity', onEnter)
      bus.off('exitCommunity', onExit)
      bus.off('openBoard', onOpen)
      bus.off('trainerDefeated', onTrainerDefeatedEvent)
      game.destroy(true)
      gameRef.current = null
      if (typeof window !== 'undefined' && window.__game) {
        delete window.__game
      }
    }
  }, [])

  // Push prop changes into the registry. Scenes listen for
  // 'changedata-communities' / 'changedata-session' / 'changedata-trainerDefeated'.
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

  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('trainerDefeated', Boolean(trainerDefeated))
  }, [trainerDefeated])

  // ---- Fullscreen toggle (the GB shell becomes the fullscreen element).
  function toggleFullscreen() {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement) {
      document.exitFullscreen?.()
    } else if (root.requestFullscreen) {
      root.requestFullscreen().catch(() => {})
    }
  }
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // ---- Overlay button handlers — emit on the bus so scenes treat
  // tap input identically to keyboard. D-pad press/release maps to
  // pressDir/releaseDir in the scene's input loop.
  const onDpadPress = (dir) => bus.emit('dpadPress', dir)
  const onDpadRelease = (dir) => bus.emit('dpadRelease', dir)
  const onAButton = () => bus.emit('aButton')

  // Dynamic topbar label — community title while inside a house,
  // "ONE REV VILLAGE" when in the town.
  const activeCommunity =
    activeCommunityId != null
      ? communities.find((c) => c.id === activeCommunityId)
      : null
  const topbarLabel = activeCommunity?.title || 'ONE REV VILLAGE'

  return (
    <div className="village-map">
      <div className="gb-shell" ref={shellRef}>
        <div className="gb-topbar">
          <span className="gb-led" />
          <span className="gb-topbar-label interior-title">{topbarLabel}</span>
          <span className="gb-topbar-tag">GAME BOY</span>
        </div>

        <div className="gb-screen">
          <div className="phaser-host" ref={hostRef} />

          <div className="screen-overlay">
            <p className="overlay-hint">Arrows / WASD walk · A to interact</p>

            <div className="overlay-slot overlay-tr">
              {dailyBrief}
              <button
                type="button"
                className="fullscreen-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? '⊟ EXIT' : '⛶ FULL'}
              </button>
            </div>

            <div className="overlay-slot overlay-bl">
              <MobileDpad onPress={onDpadPress} onRelease={onDpadRelease} />
            </div>

            <div className="overlay-slot overlay-br">
              <button
                type="button"
                className="action-btn"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onAButton}
                aria-label="A button"
              >
                A
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
