import { useEffect, useRef, useState, type ReactNode } from 'react'
import Phaser from 'phaser'
import TownScene from './scenes/TownScene.js'
import InteriorScene from './scenes/InteriorScene.js'
import EncounterScene from './scenes/EncounterScene.js'
import MapScene from './scenes/MapScene.js'
import MobileDpad from '../MobileDpad.tsx'
import PerfStallNotice from '../PerfStallNotice.tsx'
import bus from './bus.js'
import { villageZone } from './villageZone.ts'
import type { Community } from '../../communities/schema.ts'
import type { GameSession } from '../../game-session/schema.ts'
import type { TileObject } from '../../catalog/tileObjects/schema.ts'
import type { HometownPolicy } from '../town.ts'
import type { GroundTile } from '../../catalog/groundTiles/schema.ts'
import type { MonsterPoolEntry } from '../../catalog/monsters/schema.ts'

// Player walks — rpg-char-01 sprite sheet from the pokemon-js external
// assets. 32×32 PNGs, rows = direction (r0 down, r1 left, r2 right,
// r3 up), columns = frame (c0 still, c1 step-A, c2 step-B). DOM engine
// is unaffected; it still uses the original front-/back-/left-/right-
// PNGs from the same `character/` directory.
import downStill from '../assets/character/rpg-char-01/r0-c0.png'
import downWalk1 from '../assets/character/rpg-char-01/r0-c1.png'
import downWalk2 from '../assets/character/rpg-char-01/r0-c2.png'
import leftStill from '../assets/character/rpg-char-01/r1-c0.png'
import leftWalk1 from '../assets/character/rpg-char-01/r1-c1.png'
import leftWalk2 from '../assets/character/rpg-char-01/r1-c2.png'
import rightStill from '../assets/character/rpg-char-01/r2-c0.png'
import rightWalk1 from '../assets/character/rpg-char-01/r2-c1.png'
import rightWalk2 from '../assets/character/rpg-char-01/r2-c2.png'
import upStill from '../assets/character/rpg-char-01/r3-c0.png'
import upWalk1 from '../assets/character/rpg-char-01/r3-c1.png'
import upWalk2 from '../assets/character/rpg-char-01/r3-c2.png'
import { BUILDINGS } from '../buildings.js'

// 3 frames per direction: index 0 still, 1+2 walk cycle.
const ASSETS = {
  player: {
    down: [downStill, downWalk1, downWalk2],
    up: [upStill, upWalk1, upWalk2],
    left: [leftStill, leftWalk1, leftWalk2],
    right: [rightStill, rightWalk1, rightWalk2],
  },
  // Map of building-key → { roofUrl, bodyUrl }, auto-discovered from
  // assets/buildings/. TownScene loads every entry and picks per community.
  buildings: BUILDINGS,
}

// Design resolution matches the DOM town for a 5-community seed
// (24 cols × 19 rows × 48 px = 1152 × 912). Phaser's Scale.FIT keeps that
// aspect ratio inside whatever box the GB shell gives us; TownScene
// resizes the world bounds for larger towns at runtime.
const DESIGN_WIDTH = 1152
const DESIGN_HEIGHT = 912

// PR-E village shell. Wraps the Phaser canvas in the GB chrome and
// renders the DOM overlay (D-pad / A button / FULL / Daily Brief)
// floating on top of it. The overlay forwards taps + clicks to the
// scenes via the bus so on-screen and keyboard input behave identically.
export type PhaserGameProps = {
  communities: readonly Community[]
  session: GameSession
  // The resolved Hometown Policy (#173): the active foliage object per kind,
  // consumed by buildTown at scene boot. A null role places nothing.
  policy: HometownPolicy
  building: TileObject | null
  groundTiles: readonly GroundTile[]
  characterManifest: object | null
  monsterPool: readonly MonsterPoolEntry[]
  dailyBrief: ReactNode
  activeCommunityId: number | null
  onEnterCommunity: (id: number) => void
  onExitCommunity: (id?: number | null) => void
  onOpenBoard: (boardType?: string) => void
  // An encounter started — wild grass or the gate-trainer duel (issue #103).
  // One call per encounter; the shell captures it as a PostHog event.
  onEncounter: (payload: { kind: 'wild' | 'trainer'; name: string }) => void
  // Gated door (issue #24): the scene paused and asked the shell to run the
  // gate; the shell resolves to true (enter) / false (release). PhaserGame
  // bridges the result back to the scene over the bus.
  onRequestEntry: (payload: { communityId: number; gate: string }) => Promise<boolean>
  // Door-as-Portal (#111): the scene paused on a door with an authored interior
  // Node; the shell loads the target before leaving (#84) and resolves to the
  // baked map bundle (enter) or null (release). PhaserGame swaps to MapScene.
  onPortal: (payload: {
    // Null on an onward hop fired from a Node the shell reached without a door.
    communityId: number | null
    portal: { kind: 'portal'; targetNode: string; entrySpawnId?: string }
  }) => Promise<{ map: unknown; objects: unknown } | null>
  trainerDefeated: boolean
  onTrainerDefeated: () => void
}

export default function PhaserGame({
  communities,
  session,
  policy,
  building,
  groundTiles,
  characterManifest,
  monsterPool,
  dailyBrief,
  activeCommunityId,
  onEnterCommunity,
  onExitCommunity,
  onOpenBoard,
  onEncounter,
  onRequestEntry,
  onPortal,
  trainerDefeated,
  onTrainerDefeated,
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const enterCommunityRef = useRef(onEnterCommunity)
  enterCommunityRef.current = onEnterCommunity
  const exitCommunityRef = useRef(onExitCommunity)
  exitCommunityRef.current = onExitCommunity
  const openBoardRef = useRef(onOpenBoard)
  openBoardRef.current = onOpenBoard
  const encounterRef = useRef(onEncounter)
  encounterRef.current = onEncounter
  const requestEntryRef = useRef(onRequestEntry)
  requestEntryRef.current = onRequestEntry
  const portalRef = useRef(onPortal)
  portalRef.current = onPortal
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
        // RESIZE = canvas display size matches .gb-screen exactly,
        // no aspect-preserving letterbox. The world renders at 1:1
        // device pixels so each TILE=48 tile is 48 screen pixels —
        // pixel-identical to the DOM engine's render.
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: DESIGN_WIDTH,
        height: DESIGN_HEIGHT,
      },
      scene: [TownScene, InteriorScene, EncounterScene, MapScene],
    })

    game.registry.set('assets', ASSETS)
    game.registry.set('communities', communities)
    game.registry.set('session', session)
    game.registry.set('hometownPolicy', policy || null)
    game.registry.set('buildingObject', building || null)
    // Ground-tile catalog — read once by TownScene.preload() to load the
    // referenced tilesets, same boot-input timing as the hometown policy.
    game.registry.set('groundTiles', groundTiles || [])
    // The active character manifest (sprite-mapper). Set synchronously after
    // construction — Phaser defers boot, so this lands before TownScene's
    // preload() reads it (same timing the hometown policy relies on).
    game.registry.set('characterManifest', characterManifest || null)
    // Authored wild-encounter pool (#69) — read at roll time in TownScene.
    game.registry.set('monsterPool', monsterPool || [])
    game.registry.set('trainerDefeated', Boolean(trainerDefeated))

    // Load a target Node in the shell and swap the map-agnostic MapScene onto
    // it, setting the same registry keys MapPage sets. Shared by the two ways
    // into a Node: a door in the town (#111) and an onward Portal from another
    // Node (#249). A failed / forbidden load returns false and starts nothing —
    // the avatar stays where it is and the shell's banner is the notice (#84).
    // Stopping both scenes covers either origin; stopping an idle one is a no-op.
    const enterPortal = async (
      portal: { kind: 'portal'; targetNode: string; entrySpawnId?: string },
      communityId: number | null,
    ) => {
      const loaded = await portalRef.current?.({ communityId, portal })
      if (!loaded) return false
      game.registry.set('bakedMap', loaded.map)
      game.registry.set('bakedObjects', loaded.objects)
      game.registry.set('entrySpawnId', portal.entrySpawnId)
      // Keep the community that owns this chain: an onward hop stays inside the
      // community it entered, so exit-to-town still reports the right door.
      game.registry.set('portalCommunityId', communityId)
      game.scene.stop('Town')
      game.scene.stop('Map')
      game.scene.start('Map')
      return true
    }

    // The one event channel out of an authored interior Node (#85, #111, #249).
    game.registry.set(
      'onZone',
      villageZone({
        exitToTown: () => {
          const id = (game.registry.get('portalCommunityId') as number | undefined) ?? null
          bus.emit('exitCommunity', id)
          game.scene.stop('Map')
          game.scene.start('Town', { exitedCommunityId: id })
        },
        travel: (portal) => {
          void enterPortal(portal, (game.registry.get('portalCommunityId') as number | undefined) ?? null)
        },
        openLink: (url) => window.open(url, '_blank', 'noopener'),
      }),
    )

    gameRef.current = game

    const onEnter = (id: number) => enterCommunityRef.current?.(id)
    const onExit = (id: number) => exitCommunityRef.current?.(id)
    const onOpen = (boardType: string) => openBoardRef.current?.(boardType)
    const onEncounterEvent = (payload: { kind: 'wild' | 'trainer'; name: string }) =>
      encounterRef.current?.(payload)
    const onTrainerDefeatedEvent = () => trainerDefeatedRef.current?.()
    // Run the gate in the shell, then report the verdict back to the paused
    // scene so it enters (pass) or resumes in place (fail). Issue #24.
    const onRequest = async (payload: { communityId: number; gate: string }) => {
      const granted = await requestEntryRef.current?.(payload)
      bus.emit('entryResolved', { communityId: payload.communityId, granted: Boolean(granted) })
    }
    // Door-as-Portal travel (#111): load the interior Node in the shell while
    // TownScene sits paused at the door, then swap to MapScene. A failed load
    // releases the scene — gated refusal, #84.
    const onPortalRequest = async (payload: {
      communityId: number
      portal: { kind: 'portal'; targetNode: string; entrySpawnId?: string }
    }) => {
      const granted = await enterPortal(payload.portal, payload.communityId)
      if (granted) enterCommunityRef.current?.(payload.communityId)
      else bus.emit('portalResolved', { granted: false })
    }
    bus.on('enterCommunity', onEnter)
    bus.on('exitCommunity', onExit)
    bus.on('openBoard', onOpen)
    bus.on('encounter', onEncounterEvent)
    bus.on('requestEntry', onRequest)
    bus.on('requestPortal', onPortalRequest)
    bus.on('trainerDefeated', onTrainerDefeatedEvent)

    return () => {
      bus.off('enterCommunity', onEnter)
      bus.off('exitCommunity', onExit)
      bus.off('openBoard', onOpen)
      bus.off('encounter', onEncounterEvent)
      bus.off('requestEntry', onRequest)
      bus.off('requestPortal', onPortalRequest)
      bus.off('trainerDefeated', onTrainerDefeatedEvent)
      game.destroy(true)
      gameRef.current = null
      if (typeof window !== 'undefined' && (window as any).__game) {
        delete (window as any).__game
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

  // Like communities/session, the Hometown Policy is a scene-boot input: the
  // scene reads it once at create(). Pushing it keeps the registry fresh so
  // the next VillageGame mount / reload renders the latest active objects.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('hometownPolicy', policy || null)
  }, [policy])

  // Admin-mapped house (#29) — boot input like the flower art; refresh the
  // registry so the next VillageGame mount / reload renders the latest house.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('buildingObject', building || null)
  }, [building])

  // Ground-tile catalog — boot input like the hometown policy; pushing it keeps the
  // registry fresh for the next VillageGame mount / reload.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('groundTiles', groundTiles || [])
  }, [groundTiles])

  // Like the hometown policy, the character manifest is a scene-boot input read once in
  // preload(); pushing it keeps the registry fresh for the next mount/reload.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('characterManifest', characterManifest || null)
  }, [characterManifest])

  // Authored wild-encounter pool — refreshed when the admin edits it and the
  // town reloads; TownScene reads it live at each grass roll.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('monsterPool', monsterPool || [])
  }, [monsterPool])

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
  const onDpadPress = (dir: string) => bus.emit('dpadPress', dir)
  const onDpadRelease = (dir: string) => bus.emit('dpadRelease', dir)
  const onAButton = () => bus.emit('aButton')

  // Dynamic topbar label — community title while inside a house,
  // "ODT VILLE" when in the town.
  const activeCommunity =
    activeCommunityId != null
      ? communities.find((c) => c.id === activeCommunityId)
      : null
  const topbarLabel = activeCommunity?.title || 'ODT VILLE'

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
            <p className="overlay-hint">Arrows / WASD walk · A to interact · G grid</p>

            <PerfStallNotice />

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
