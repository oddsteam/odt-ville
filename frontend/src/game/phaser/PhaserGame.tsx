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
import { silenceKeyboard } from './gameKeyboard.ts'
import { applyMapTarget } from '../../kernel/mapTarget.ts'
import { warp } from '../transition.ts'
import { trainerOpponent } from './trainerDuel.ts'
import { gateTrainerOpponent, pickWild, wildStepGate } from '../encounters.js'
import type { Community } from '../../communities/schema.ts'
import type { GameSession } from '../../game-session/schema.ts'
import type { TileObject } from '../../catalog/tileObjects/schema.ts'
import type { HometownPolicy } from '../town.ts'
import type { GroundTile } from '../../catalog/groundTiles/schema.ts'
import type { MonsterPoolEntry } from '../../catalog/monsters/schema.ts'
import type { Npc } from '../../catalog/npcs/schema.ts'

// The Standee expiry window the deploy form offers (#374): a week by default,
// a month at most. Literals rather than an import — the game black box takes no
// standees/ import (ADR-0004), the same reason the budget arrives as a plain
// shape — and the backend (`Standees::Standee::DEFAULT_DAYS`/`MAX_DAYS`) stays
// the enforcement point; this only keeps the form from asking for a refusal.
const STANDEE_DEFAULT_DAYS = 7
const STANDEE_MAX_DAYS = 30

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
  // Per-community building assignments (#292), keyed by tile-object id — the
  // batched-fetch result each plot resolves against (assigned → active →
  // bundled). Empty means every plot uses `building` / bundled art.
  buildingsById: Record<number, TileObject>
  groundTiles: readonly GroundTile[]
  characterManifest: object | null
  // The NPC catalog (#259) — identity + sprite for placed characters, read at
  // duel-start to resolve a fired trainer Zone's npcId. A shell-fetched
  // black-box input; empty means no trainer zone can duel.
  npcs: readonly Npc[]
  // Fetch the wild pool an encounter Zone names (#87). A prop rather than a
  // direct call because the game never imports a data service (ADR-0004) — the
  // same reason `onPortal` loads a target map for us. An empty slug means the
  // whole global pool; a rejected promise rolls nothing.
  onEncounterPool: (pool: string) => Promise<readonly MonsterPoolEntry[]>
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
    // The connected presence room for a multiplayer target (#269), or null for
    // a solo map. Opaque here — the shell owns the wire, MapScene reads it off
    // the registry exactly as it does on the standalone /maps/:slug page.
    // `voice` (#287) rides the same bundle: the proximity-voice mesh for a
    // multiplayer target, or null for a solo map.
  }) => Promise<{
    map: unknown
    objects: unknown
    bakedNpcs?: unknown
    // The Standees standing on the target (#369, ADR-0015) — resolved by the
    // shell like bakedNpcs, so the portal path can't drop them (the #294/#295 trap).
    bakedStandees?: unknown
    presence?: unknown
    voice?: unknown
  } | null>
  // Deploy a Standee (#369, ADR-0015): the overlay's deploy control calls in
  // here so the write stays out of the game black box (ADR-0004) — the shell
  // owns the POST and the outbound data service. Resolves to the created Standee
  // (echoed onto the bus so the scene stands the cutout up at once) or null on a
  // refusal. Absent on shells that don't offer deploying (e.g. the town-only page).
  onDeployStandee?: (payload: {
    slug: string
    x: number
    y: number
    message: string
    // The Placard's optional detail body (#372) — the longer text revealed on
    // press-A. Absent leaves a short-line-only Placard.
    detail?: string
    // The optional reply link (#373) — a campfire or thread. Absent leaves a
    // Placard with no reply button.
    reply?: string
    // How long the cutout stands, in days (#374). Absent takes the server's
    // default of 7; beyond its cap of 30 it refuses rather than clamps.
    expiresDays?: number
  }) => Promise<{
    id: number
    x: number
    y: number
    message: string
    detail?: string | null
    reply_link?: string | null
    expires_at?: string
    owner_name?: string | null
    owner_avatar_url?: string | null
  } | null>
  // Pressing A on a Standee (#372): the game emits the Placard it carries and
  // the shell mounts the full-bleed detail panel, resolving this when the reader
  // closes it — PhaserGame then tells the scene to resume input. The seam
  // mirrors onEnterCommunity: a semantic event out, no panel inside the black
  // box. Absent on shells that don't render Placards (input resumes at once).
  onReadStandee?: (placard: {
    id: number
    message: string
    detail: string | null
    ownerName: string | null
    ownerAvatarUrl: string | null
    replyLink: string | null
    mine: boolean
    expiresAt: string
  }) => Promise<void>
  // The caller's world-wide Standee budget (#371): the count out, the cap,
  // whether a deploy is allowed, and the located refusal when at the cap. A
  // plain display shape resolved by the shell — no standees/ import enters the
  // game black box (ADR-0004). Null until loaded: the affordance shows the form.
  standeeBudget?: {
    out: number
    cap: number
    allowed: boolean
    reason: string | null
  } | null
  trainerDefeated: boolean
  onTrainerDefeated: () => void
}

export default function PhaserGame({
  communities,
  session,
  policy,
  building,
  buildingsById,
  groundTiles,
  characterManifest,
  npcs,
  onEncounterPool,
  dailyBrief,
  activeCommunityId,
  onEnterCommunity,
  onExitCommunity,
  onOpenBoard,
  onEncounter,
  onRequestEntry,
  onPortal,
  onDeployStandee,
  onReadStandee,
  standeeBudget,
  trainerDefeated,
  onTrainerDefeated,
}: PhaserGameProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const gameRef = useRef<Phaser.Game | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Which map the game is currently showing (#369), learned from the scene over
  // the bus — the deploy control shows only on a multiplayer map and POSTs to
  // this slug. Null in the town / on a solo map.
  const [mapContext, setMapContext] = useState<{ slug: string; multiplayer: boolean } | null>(null)
  // The deploy form is summoned, not permanent (#380): a rare action (3 cutouts
  // a week) has no business covering the map, and a text input mounted over the
  // game is a permanent fight with Phaser's keyboard capture. Open is a state
  // the shell owns — the keyboard follows it, not DOM focus.
  const [standeeOpen, setStandeeOpen] = useState(false)
  const [standeeLine, setStandeeLine] = useState('')
  const [standeeDetail, setStandeeDetail] = useState('')
  const [standeeReply, setStandeeReply] = useState('')
  // How long the cutout stands (#374), in days. A Standee is time-bound by
  // construction, so this defaults to a week and the field refuses to go past a
  // month — the backend enforces the same window, and refuses rather than
  // clamps, so a form that can't ask for 31 never gets that refusal.
  const [standeeDays, setStandeeDays] = useState(STANDEE_DEFAULT_DAYS)
  const [deploying, setDeploying] = useState(false)
  const deployStandeeRef = useRef(onDeployStandee)
  deployStandeeRef.current = onDeployStandee
  const readStandeeRef = useRef(onReadStandee)
  readStandeeRef.current = onReadStandee

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
  const encounterPoolRef = useRef(onEncounterPool)
  encounterPoolRef.current = onEncounterPool
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
      backgroundColor: '#000000',
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
    game.registry.set('hometownBuildings', buildingsById || {})
    // Ground-tile catalog — read once by TownScene.preload() to load the
    // referenced tilesets, same boot-input timing as the hometown policy.
    game.registry.set('groundTiles', groundTiles || [])
    // The active character manifest (sprite-mapper). Set synchronously after
    // construction — Phaser defers boot, so this lands before TownScene's
    // preload() reads it (same timing the hometown policy relies on).
    game.registry.set('characterManifest', characterManifest || null)
    // NPC catalog (#259) — read live at duel-start, so a late-arriving fetch
    // still resolves a trainer's sprite on the next fire.
    game.registry.set('npcs', npcs || [])
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
      // The per-target keys in one place (#303), shared with MapPage's route.
      // Set every hop so a solo target clears the previous map's rig/room/mesh
      // rather than inheriting it — bakedNpcs (#294/#295), presence (#269),
      // voice (#287) all default rather than persist.
      applyMapTarget(game.registry, {
        map: loaded.map,
        objects: loaded.objects,
        bakedNpcs: loaded.bakedNpcs ?? [],
        bakedStandees: loaded.bakedStandees ?? [],
        entrySpawnId: portal.entrySpawnId,
        presence: loaded.presence ?? null,
        voice: loaded.voice ?? null,
      })
      // Keep the community that owns this chain: an onward hop stays inside the
      // community it entered, so exit-to-town still reports the right door.
      game.registry.set('portalCommunityId', communityId)
      // Swap at black (#254): the fade is bounded and the load already resolved
      // above, so this waits on the effect, not the network. Stopping both
      // scenes covers either origin; stopping an idle one is a no-op.
      await warp(() => {
        game.scene.stop('Town')
        game.scene.stop('Map')
        game.scene.start('Map')
      })
      return true
    }

    // Which world scene fired the zone — the village runs one world at a time
    // (TownScene for the generated hometown, MapScene for an authored Node).
    // EncounterScene resumes whichever launched it (#259).
    const worldKey = () => (game.scene.isActive('Town') ? 'Town' : 'Map')

    // Start a trainer duel from a fired trainer Zone (#259/#255): resolve the
    // payload's npcId against the live NPC catalog, then launch EncounterScene
    // over the paused world. In the hometown an unresolved id falls back to the
    // bundled gate trainer — the #69 move, so the gate is never unguarded by an
    // unseeded catalog — while an authored map keeps the quiet no-op.
    const startDuel = (npcId: number) => {
      const world = worldKey()
      const opponent =
        trainerOpponent((game.registry.get('npcs') as readonly Npc[]) || [], npcId) ??
        (world === 'Town' ? gateTrainerOpponent() : null)
      if (!opponent) return
      const worldScene = game.scene.getScene(world)
      if (!worldScene) return
      bus.emit('encounter', { kind: 'trainer', name: opponent.name })
      worldScene.scene.pause()
      worldScene.scene.launch('Encounter', { opponent, worldScene: world })
    }

    // Roll a wild from a fired encounter Zone (#87/#255), the counterpart of
    // startDuel. The per-step gate owns the GB rate + grace rhythm; on a hit the
    // shell fetches the named pool (ADR-0004 keeps the fetch out of the game)
    // and pickWild's #69 fallback keeps the grass alive when that pool is
    // empty. A failed fetch rolls nothing rather than surfacing an error mid-step.
    const grassGate = wildStepGate()
    const startEncounter = (pool: string) => {
      if (!grassGate()) return
      const world = worldKey()
      void encounterPoolRef.current?.(pool)
        .then((rows) => {
          const worldScene = game.scene.getScene(world)
          if (!worldScene) return
          const opponent = pickWild(rows)
          bus.emit('encounter', { kind: 'wild', name: opponent.name })
          worldScene.scene.pause()
          worldScene.scene.launch('Encounter', { opponent, worldScene: world })
        })
        .catch(() => {})
    }

    // The one event channel out of an authored interior Node (#85, #111, #249).
    game.registry.set(
      'onZone',
      villageZone({
        exitToTown: () => {
          const id = (game.registry.get('portalCommunityId') as number | undefined) ?? null
          bus.emit('exitCommunity', id)
          void warp(() => {
            game.scene.stop('Map')
            game.scene.start('Town', { exitedCommunityId: id })
          })
        },
        travel: (portal) => {
          void enterPortal(portal, (game.registry.get('portalCommunityId') as number | undefined) ?? null)
        },
        openLink: (url) => window.open(url, '_blank', 'noopener'),
        startDuel,
        startEncounter,
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

  // Per-community building assignments (#292) — boot input like the house.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('hometownBuildings', buildingsById || {})
  }, [buildingsById])

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

  // NPC catalog — refreshed when the admin edits it and the town reloads; the
  // duel-start reads it live from the registry at each trainer fire.
  useEffect(() => {
    const game = gameRef.current
    if (!game) return
    game.registry.set('npcs', npcs || [])
  }, [npcs])

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

  // Track which map the scene is on so the deploy control (#369) appears only on
  // a multiplayer map. MapScene emits `mapEntered`/`mapLeft` around its lifetime.
  useEffect(() => {
    const entered = (ctx: { slug: string; multiplayer: boolean }) => setMapContext(ctx)
    const left = () => {
      setMapContext(null)
      setStandeeOpen(false)
      setStandeeLine('')
      setStandeeDetail('')
    }
    bus.on('mapEntered', entered)
    bus.on('mapLeft', left)
    return () => {
      bus.off('mapEntered', entered)
      bus.off('mapLeft', left)
    }
  }, [])

  // Press-A-to-read (#372): the scene emits the Placard and has already paused
  // its own input; the shell mounts the panel via onReadStandee and resolves
  // when the reader closes it. Emit `standeeClosed` back so the scene resumes —
  // and emit it at once when no shell handler is wired, so input never sticks.
  useEffect(() => {
    const onRead = (placard: {
      id: number
      message: string
      detail: string | null
      ownerName: string | null
      ownerAvatarUrl: string | null
      replyLink: string | null
      mine: boolean
      expiresAt: string
    }) => {
      const handler = readStandeeRef.current
      if (!handler) {
        bus.emit('standeeClosed')
        return
      }
      handler(placard).finally(() => bus.emit('standeeClosed'))
    }
    bus.on('readStandee', onRead)
    return () => {
      bus.off('readStandee', onRead)
    }
  }, [])

  // While the deploy panel is open the game's keyboard is silent and Escape
  // dismisses it (#380). One effect, so every close path — deploying,
  // cancelling, dismissing, walking out of the map — hands the keyboard back
  // through the same cleanup.
  useEffect(() => {
    if (!standeeOpen) return
    const restore = silenceKeyboard(gameRef.current?.input?.keyboard)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStandeeOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      restore()
    }
  }, [standeeOpen])

  // Deploy a Standee where the avatar stands (#369): the shell owns the write,
  // and on success the created Standee rides the bus so the scene stands the
  // cutout up without a reload. The cell comes from the scene's test API, the
  // same source the walking e2e scripts read.
  const submitStandee = async () => {
    const line = standeeLine.trim()
    const deploy = deployStandeeRef.current
    if (!line || !mapContext || !deploy) return
    const tile = (window as unknown as { __game?: { playerTile?: () => { x: number; y: number } } })
      .__game?.playerTile?.()
    if (!tile) return
    const detail = standeeDetail.trim()
    const reply = standeeReply.trim()
    setDeploying(true)
    const created = await deploy({
      slug: mapContext.slug,
      x: tile.x,
      y: tile.y,
      message: line,
      detail: detail || undefined,
      reply: reply || undefined,
      expiresDays: standeeDays,
    }).catch(() => null)
    setDeploying(false)
    if (created) {
      bus.emit('standeeDeployed', created)
      setStandeeLine('')
      setStandeeDetail('')
      setStandeeReply('')
      setStandeeDays(STANDEE_DEFAULT_DAYS)
      // Closing returns the map to being the map — and the effect's cleanup
      // hands the keyboard back, so the avatar walks again straight away.
      setStandeeOpen(false)
    }
  }

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
              {/* Summons the deploy form (#380). Sits with the Daily Brief and
                  fullscreen affordances, on a multiplayer map only — the same
                  condition the form itself carried when it was always on. */}
              {mapContext?.multiplayer && onDeployStandee && !standeeOpen && (
                <button
                  type="button"
                  className="standee-open-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setStandeeOpen(true)}
                  title="Leave a Standee here"
                >
                  🪧 Standee
                </button>
              )}
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

            {standeeOpen && mapContext?.multiplayer && onDeployStandee && (
              <div
                className="overlay-slot overlay-standee"
                role="dialog"
                aria-label="Leave a Standee"
              >
                {/* The world-wide budget of 3 (#371): "N of 3 out" before the
                    employee writes anything. At the cap the form is replaced by
                    the located refusal — never asked to fill a form they can't
                    submit — pointing at where their Standees already stand. */}
                {standeeBudget && (
                  <p className="standee-budget">
                    {standeeBudget.out} of {standeeBudget.cap} out
                  </p>
                )}
                {standeeBudget && !standeeBudget.allowed ? (
                  <p className="standee-refusal">{standeeBudget.reason}</p>
                ) : (
                  // The game's keyboard is already silent for as long as this
                  // panel is open (#380), so typing here reaches the fields
                  // instead of walking the avatar.
                  <div className="standee-form">
                    <input
                      type="text"
                      className="standee-input"
                      // The panel exists only because you asked for it, so land
                      // in the field you asked for rather than making you click.
                      autoFocus
                      value={standeeLine}
                      maxLength={60}
                      placeholder="Short line…"
                      onChange={(e) => setStandeeLine(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void submitStandee()
                        }
                      }}
                    />
                    {/* The Placard's detail body (#372): the time, the place,
                        what to bring — revealed on press-A, kept off the map so
                        the short line over the head stays a glance. Optional. */}
                    <textarea
                      className="standee-detail"
                      value={standeeDetail}
                      maxLength={500}
                      rows={3}
                      placeholder="Details (optional)…"
                      onChange={(e) => setStandeeDetail(e.target.value)}
                    />
                    {/* The reply link (#373): a campfire or thread where the
                        conversation happens, so interested people land in one
                        place. Optional; only an http(s) link becomes a button. */}
                    <input
                      type="url"
                      className="standee-input"
                      value={standeeReply}
                      placeholder="Reply link (optional)…"
                      onChange={(e) => setStandeeReply(e.target.value)}
                    />
                    {/* How long it stands (#374). A Standee is time-bound by
                        construction — peer clutter has no gardener, so a cutout
                        decays instead of accumulating. `max` is the native
                        guard; the backend refuses anything past it too. */}
                    <label className="standee-days">
                      Stands for
                      <input
                        type="number"
                        className="standee-days-input"
                        value={standeeDays}
                        min={1}
                        max={STANDEE_MAX_DAYS}
                        onChange={(e) =>
                          setStandeeDays(Math.min(Number(e.target.value) || 1, STANDEE_MAX_DAYS))
                        }
                      />
                      days
                    </label>
                    <button
                      type="button"
                      className="standee-btn"
                      disabled={deploying || !standeeLine.trim()}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void submitStandee()}
                    >
                      {deploying ? '…' : 'Leave standee'}
                    </button>
                  </div>
                )}
                {/* Leaving without deploying — offered at the cap too, so the
                    refusal is something you can walk away from. */}
                <button
                  type="button"
                  className="standee-btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setStandeeOpen(false)}
                >
                  Close
                </button>
              </div>
            )}

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
