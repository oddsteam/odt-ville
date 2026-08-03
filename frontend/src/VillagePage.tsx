import { useCallback, useEffect, useRef, useState } from 'react'
import VillageGame from './game/VillageGame.tsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.tsx'
import { saveGameSession } from './game-session/client.js'
import { startPosture, confirmPosture } from './posture/client.ts'
import { runPostureGate } from './posture/runGate.ts'
import { openGatePopup, awaitGateResult } from './posture/popup.ts'
import { CALLBACK_PATH } from './posture/callback.ts'
import { loadTown as loadTownData, townErrorMessage } from './townLoader.ts'
import { MapsService } from './maps/service.ts'
import { StandeesWrite } from './standees/write.ts'
import { StandeesService } from './standees/service.ts'
import { standeeBudget } from './standees/budget.ts'
import type { MyStandees } from './standees/schema.ts'
import { loadMapBundle } from './maps/target.ts'
import { runEdge } from './lib/runEdge.ts'
import { subscribeAuthToken } from './lib/authToken.ts'
import { connectPresence } from './lib/presenceClient.ts'
import { presenceSession } from './lib/presenceSession.ts'
import { voiceSession } from './lib/voiceSession.ts'
import { connectVoice } from './voice/mesh.ts'
import { ViewerService } from './viewer/service.ts'
import { loadManifestById } from './character/service.ts'
import { trackEnterDoor, trackInteractBoard, trackEncounter } from './analytics/events.ts'
import type { Community, FeedItem } from './communities/schema.ts'
import type { GameSession } from './game-session/schema.ts'
import type { TileObject } from './catalog/tileObjects/schema.ts'
import type { HometownPolicy } from './game/town.ts'
import type { GroundTile } from './catalog/groundTiles/schema.ts'
import { MonstersService } from './catalog/monsters/service.ts'
import type { Npc } from './catalog/npcs/schema.ts'

// Every board's "open content list" action opens the one URL configured on
// the deployment (#335); unset = the press quietly opens nothing. Replaced in
// a follow-up by per-board content-list views (see issue #15 follow-ups).
const BOARD_URL: string | null = import.meta.env.VITE_BOARD_URL || null

// The village route owns all town-scene data and hands it to <VillageGame> as
// props, listens for game events, and persists session changes. Nothing here
// knows about tiles, sprites, or encounters — the game is a black box. Admin
// tooling lives under /admin (see AdminLayout); this page is purely the game.
export default function VillagePage() {
  // PR-E retired the DOM engine; the village game now always runs on
  // Phaser, which owns its own scene transitions inside the canvas. The
  // page just tracks which community the player is inside (for the
  // active-community-id prop forwarded into PhaserGame's registry).
  const [activeCommunityId, setActiveCommunityId] = useState<number | null>(null)
  // Gate-trainer state — once you've escaped the duel he never challenges
  // again in this session. Lifted to the page so it survives VillageGame
  // remounts when you enter / exit a community.
  const [trainerDefeated, setTrainerDefeated] = useState(false)

  const [communities, setCommunities] = useState<readonly Community[] | null>(null)
  const [session, setSession] = useState<GameSession | null>(null)
  const [feed, setFeed] = useState<readonly FeedItem[]>([])
  // The resolved Hometown Policy (#173): the active foliage object per kind,
  // read by the generated town at build time. A null role places nothing.
  const [policy, setPolicy] = useState<HometownPolicy>({
    tree: null,
    flowerGroup: null,
    flowerSingle: null,
  })
  // Admin-mapped house (tile-object mapper, kind 'building', #29) — replaces the
  // bundled buildings and carries the door anchor. Null falls back to bundled art.
  const [building, setBuilding] = useState<TileObject | null>(null)
  // Per-community building assignments (#292), keyed by tile-object id.
  // Assigned plots resolve here first; empty falls back to `building`/bundled.
  const [buildingsById, setBuildingsById] = useState<Record<number, TileObject>>({})
  // Ground-tile catalog (ground-tile mapper): grass/dirt/road cells painted
  // onto the town's ground, encounter field, and roads. Empty array falls back
  // to the procedural tile textures, so it's a pure visual enhancement.
  const [groundTiles, setGroundTiles] = useState<readonly GroundTile[]>([])
  // The active character sprite (sprite-mapper manifest). Drives the town
  // player; loadActiveManifest always resolves (remote → committed default).
  const [characterManifest, setCharacterManifest] = useState<object | null>(null)
  // The NPC catalog (#259) — identity + sprite for trainer-Zone duels on
  // authored interiors. Best-effort: empty means a trainer zone duels nobody.
  const [npcs, setNpcs] = useState<readonly Npc[]>([])
  // The caller's world-wide Standee budget (#371, ADR-0015): their Standees
  // across every map plus the cap, so the deploy affordance can show "N of 3
  // out" and refuse — with a located pointer — before anything is typed. Null
  // until fetched; a failed fetch just hides the count, never blocks deploying.
  const [myStandees, setMyStandees] = useState<MyStandees | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Town-scene state — fetched on mount and after any communities-mutating
  // action so the game always sees fresh communities + session + feed.
  const loadTown = useCallback(async () => {
    const town = await runEdge(loadTownData())
    setCommunities(town.communities)
    setSession(town.session)
    setFeed(town.feed)
    setPolicy(town.policy)
    setBuilding(town.building)
    setBuildingsById(town.buildingsById)
    setGroundTiles(town.groundTiles)
    setCharacterManifest(town.characterManifest)
    setNpcs(town.npcs)
    // Best-effort: the budget is a pure overlay enhancement, so a failure here
    // must never blank the town.
    setMyStandees(await runEdge(StandeesService.mine()).catch(() => null))
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadTown()
      .catch((e) => active && setError(townErrorMessage(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadTown])

  // Re-run the town load whenever the active user changes (dev switcher). The
  // first paint happens before a user is picked, so its fetches 401 and stick
  // on the no-access screen; switching users must recover, not just the
  // header. No-op in prod where the token is set once before render.
  useEffect(
    () =>
      subscribeAuthToken(() => {
        setError(null)
        setLoading(true)
        loadTown()
          .catch((e) => setError(townErrorMessage(e)))
          .finally(() => setLoading(false))
      }),
    [loadTown],
  )

  // ---- game events --------------------------------------------------

  const handleEnterCommunity = useCallback(
    (id: number) => {
      // Save session + track the active community. Phaser's InteriorScene
      // handles the visual transition inside the canvas; the React page
      // just records the id (for the activeCommunityId prop that PhaserGame
      // forwards back into its registry).
      setActiveCommunityId(id)
      trackEnterDoor(communities, id)
      saveGameSession({ last_area: 'house', last_community_id: id }).catch(() => {})
    },
    [communities],
  )

  // Houses unlocked this session — a posture pass lasts once per session
  // (the grant lives here, not the DB), so re-entering skips the gate.
  const grantedRef = useRef<Set<number>>(new Set())

  // A gated door asked the shell to run its gate (issue #24). Drive the
  // posture-login loop and resolve true (enter) / false (release). The backend
  // confirm is the only thing that opens the gate; the popup is just UX.
  const handleRequestEntry = useCallback(
    async ({ communityId, gate }: { communityId: number; gate: string }) => {
      if (gate !== 'posture-login') return false
      if (grantedRef.current.has(communityId)) return true

      const callbackUrl = new URL(CALLBACK_PATH, window.location.origin).toString()
      try {
        const { granted } = await runPostureGate(communityId, {
          start: (id) => startPosture(id, callbackUrl),
          openPopup: (url) => openGatePopup(url),
          awaitResult: (popup) => awaitGateResult(popup as Window),
          confirm: (sessionId) => confirmPosture(sessionId),
        })
        if (granted) grantedRef.current.add(communityId)
        return granted
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Entry check failed')
        return false
      }
    },
    [],
  )

  // Presence multiplayer for maps entered through a door (#269). The wire
  // stays in the shell (ADR-0004) and the session keeps exactly one room open
  // — the door path never routes, so nothing else would ever close the last.
  const presenceRef = useRef(
    presenceSession({
      viewerId: () =>
        runEdge(ViewerService.get())
          .then((v) => v.user.external_id)
          .catch(() => null),
      connect: connectPresence,
      loadManifest: loadManifestById,
    }),
  )
  useEffect(() => () => presenceRef.current.close(), [])

  // Proximity voice for door-entered maps (#287) — the counterpart of the
  // presence session above. Same "one mesh at a time" lifecycle: a door never
  // routes, so the shell tears down the previous map's mesh before opening the
  // next. The viewer id is fetched the same way; the wire lives in voice/mesh.
  const voiceRef = useRef(
    voiceSession({
      viewerId: () =>
        runEdge(ViewerService.get())
          .then((v) => v.user.external_id)
          .catch(() => null),
      connect: connectVoice,
    }),
  )
  useEffect(() => () => voiceRef.current.close(), [])

  // A door with an authored interior Node asked to travel (#111). Load the
  // target before leaving (#84): the baked map plus the tile objects its
  // entities reference, the same bundle MapPage assembles. Null (with the
  // error banner as the refusal notice) releases the avatar at the door.
  const handlePortal = useCallback(
    async ({ portal }: { communityId: number | null; portal: { targetNode: string } }) => {
      try {
        const map = await runEdge(MapsService.get(portal.targetNode))
        // Objects + placed-NPC rigs from the shared helper (#303), the same
        // bundle MapPage's route loader assembles — so neither path can drop a
        // per-target input the other keeps.
        const { objects, bakedNpcs, bakedStandees } = await loadMapBundle(map, npcs)
        const presence = await presenceRef.current.open(map)
        const voice = await voiceRef.current.open(map)
        return { map, objects, bakedNpcs, bakedStandees, presence, voice }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return null
      }
    },
    [npcs],
  )

  // Deploy a Standee where the avatar stands (#369, ADR-0015). The shell owns
  // the durable write so the game black box imports no data service (ADR-0004);
  // PhaserGame's overlay collects the short line and the cell and calls in here,
  // then echoes the created Standee to the scene so the cutout appears at once.
  // A refusal (e.g. deploying on a solo map) surfaces on the error banner.
  const handleDeployStandee = useCallback(
    async ({ slug, x, y, message }: { slug: string; x: number; y: number; message: string }) => {
      try {
        const created = await runEdge(StandeesWrite.deploy(slug, { x, y, message }))
        // Refresh the world-wide budget so "N of 3 out" reflects the new cutout.
        setMyStandees(await runEdge(StandeesService.mine()).catch(() => null))
        return created
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return null
      }
    },
    [],
  )

  // Each board's "open content list" action. The game module knows nothing
  // about this; it just emits the board id and the page decides.
  const handleOpenBoard = useCallback(
    (boardType?: string) => {
      trackInteractBoard(communities, activeCommunityId, boardType)
      if (BOARD_URL) window.open(BOARD_URL, '_blank', 'noopener,noreferrer')
    },
    [communities, activeCommunityId],
  )

  // An encounter started in the game (wild grass or the gate trainer). The
  // game supplies kind + name; the page turns it into one PostHog event so no
  // analytics leaks into the black box (issue #103).
  const handleEncounter = useCallback(
    (payload: { kind: 'wild' | 'trainer'; name: string }) => {
      trackEncounter(payload)
    },
    [],
  )

  const handleExitCommunity = useCallback(
    (idFromCaller?: number | null) => {
      // Phaser passes the exited community id via the bus event; fall
      // back to whatever the page most recently tracked as active.
      const id = idFromCaller ?? activeCommunityId
      // Back in the hometown, which has no room of its own (#269) and no voice
      // mesh (#287) — tear both down as we leave the last authored map.
      presenceRef.current.close()
      voiceRef.current.close()
      // Optimistic local session update so the next remount spawns on the
      // just-exited doormat rather than whatever the previous loadTown
      // returned. Phaser's own scene-start data covers the within-session
      // spawn.
      setSession((prev) => ({
        ...(prev || {}),
        last_area: 'town',
        last_community_id: id,
        spawn: { area: 'town', last_community_id: id },
      }) as GameSession)
      saveGameSession({ last_area: 'town', last_community_id: id }).catch(() => {})
      setActiveCommunityId(null)
      loadTown().catch((e) => setError(e.message))
    },
    [activeCommunityId, loadTown],
  )

  const handleDailyBriefClose = useCallback(() => {
    loadTown().catch((e) => setError(townErrorMessage(e)))
  }, [loadTown])

  // ---- Render states ------------------------------------------------

  if (loading && !communities) {
    return (
      <div className="loading-card">
        <div className="loading-pixel" />
        <p>LOADING ODT VILLE…</p>
      </div>
    )
  }

  if (error && !communities) {
    return (
      <div className="error-card">
        <h2>{error}</h2>
        <button type="button" onClick={() => window.location.reload()}>
          RETRY
        </button>
      </div>
    )
  }

  if (!communities || !session) return null

  // A plain display payload for the deploy affordance (#371): the count out, the
  // cap, whether a deploy is allowed, and the located refusal — the pure budget
  // arithmetic resolved here so the game black box receives no standees/ import
  // (ADR-0004). Null until the budget loads: the affordance then just shows the
  // form, never blocking a deploy on a failed budget fetch.
  const budget = myStandees && standeeBudget(myStandees.standees, myStandees.cap)
  const standeeBudgetView = budget
    ? { out: budget.out, cap: myStandees!.cap, allowed: budget.allowed, reason: budget.reason }
    : null

  return (
    <>
      {error && (
        <div className="error-banner">
          {error}
          <button type="button" onClick={() => setError(null)}>
            DISMISS
          </button>
        </div>
      )}

      <VillageGame
        communities={communities}
        session={session}
        policy={policy}
        building={building}
        buildingsById={buildingsById}
        groundTiles={groundTiles}
        characterManifest={characterManifest}
        npcs={npcs}
        // The shell owns the fetch (ADR-0004): an encounter Zone names a pool and
        // this resolves it; an empty slug asks for the whole global pool.
        onEncounterPool={(pool) => runEdge(MonstersService.pool(pool || undefined))}
        dailyBrief={
          <DailyBriefShortcut items={feed} onClose={handleDailyBriefClose} />
        }
        activeCommunityId={activeCommunityId}
        onEnterCommunity={handleEnterCommunity}
        onExitCommunity={handleExitCommunity}
        onOpenBoard={handleOpenBoard}
        onEncounter={handleEncounter}
        onRequestEntry={handleRequestEntry}
        onPortal={handlePortal}
        onDeployStandee={handleDeployStandee}
        standeeBudget={standeeBudgetView}
        trainerDefeated={trainerDefeated}
        onTrainerDefeated={() => setTrainerDefeated(true)}
      />
    </>
  )
}
