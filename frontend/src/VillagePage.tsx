import { useCallback, useEffect, useRef, useState } from 'react'
import VillageGame from './game/VillageGame.tsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.tsx'
import { saveGameSession } from './game-session/client.js'
import { startPosture, confirmPosture } from './posture/client.ts'
import { runPostureGate } from './posture/runGate.ts'
import { openGatePopup, awaitGateResult } from './posture/popup.ts'
import { CALLBACK_PATH } from './posture/callback.ts'
import { loadTown as loadTownData, townErrorMessage } from './townLoader.ts'
import { runEdge } from './lib/runEdge.ts'
import { subscribeAuthToken } from './lib/authToken.ts'
import { trackEnterDoor, trackInteractBoard, trackEncounter } from './analytics/events.ts'
import type { Community, FeedItem } from './communities/schema.ts'
import type { GameSession } from './game-session/schema.ts'
import type { TileObject } from './catalog/tileObjects/schema.ts'
import type { HometownPolicy } from './game/town.ts'
import type { GroundTile } from './catalog/groundTiles/schema.ts'
import type { MonsterPoolEntry } from './catalog/monsters/schema.ts'

// Demo target for every board's "open content list" action. Replaced in a
// follow-up by per-board content-list views (see issue #15 follow-ups).
const DEMO_BOARD_URL = 'https://app.basecamp.com/4877526/'

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
  // Ground-tile catalog (ground-tile mapper): grass/dirt/road cells painted
  // onto the town's ground, encounter field, and roads. Empty array falls back
  // to the procedural tile textures, so it's a pure visual enhancement.
  const [groundTiles, setGroundTiles] = useState<readonly GroundTile[]>([])
  // The active character sprite (sprite-mapper manifest). Drives the town
  // player; loadActiveManifest always resolves (remote → committed default).
  const [characterManifest, setCharacterManifest] = useState<object | null>(null)
  // Admin-authored wild-encounter pool (#69) — enabled monsters with sprites.
  // Best-effort: empty array falls back to the built-in encounter table.
  const [monsterPool, setMonsterPool] = useState<readonly MonsterPoolEntry[]>([])

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
    setGroundTiles(town.groundTiles)
    setCharacterManifest(town.characterManifest)
    setMonsterPool(town.monsterPool)
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

  // Each board's "open content list" action — for the demo every board
  // points at the same external URL. The game module knows nothing about
  // this; it just emits the board id and the page decides.
  const handleOpenBoard = useCallback(
    (boardType?: string) => {
      trackInteractBoard(communities, activeCommunityId, boardType)
      window.open(DEMO_BOARD_URL, '_blank', 'noopener,noreferrer')
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
        groundTiles={groundTiles}
        characterManifest={characterManifest}
        monsterPool={monsterPool}
        dailyBrief={
          <DailyBriefShortcut items={feed} onClose={handleDailyBriefClose} />
        }
        activeCommunityId={activeCommunityId}
        onEnterCommunity={handleEnterCommunity}
        onExitCommunity={handleExitCommunity}
        onOpenBoard={handleOpenBoard}
        onEncounter={handleEncounter}
        onRequestEntry={handleRequestEntry}
        trainerDefeated={trainerDefeated}
        onTrainerDefeated={() => setTrainerDefeated(true)}
      />
    </>
  )
}
