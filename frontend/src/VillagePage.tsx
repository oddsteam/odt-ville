import { useCallback, useEffect, useState } from 'react'
import VillageGame from './game/VillageGame.tsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.tsx'
import { saveGameSession } from './game-session/client.js'
import { loadTown as loadTownData } from './game/townLoader.ts'
import { runEdge } from './lib/runEdge.ts'
import type { Community, FeedItem } from './communities/schema.ts'
import type { GameSession } from './game-session/schema.ts'
import type { TileObject } from './tileObjects/schema.ts'
import type { GroundTile } from './groundTiles/schema.ts'

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
  // The admin-defined tree object (tile-object mapper), rendered by the game.
  // Optional enhancement — null is fine and falls back to the bundled tree.
  const [treeObject, setTreeObject] = useState<TileObject | null>(null)
  // Admin flower art (tile-object mapper, kinds 'flower-group' / 'flower-single')
  // for the '*' scatter (#27): the group is tiled across clusters, the single
  // fills leftover cells. Optional — null falls back to the procedural buds.
  const [flowerGroup, setFlowerGroup] = useState<TileObject | null>(null)
  const [flowerSingle, setFlowerSingle] = useState<TileObject | null>(null)
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

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Town-scene state — fetched on mount and after any communities-mutating
  // action so the game always sees fresh communities + session + feed.
  const loadTown = useCallback(async () => {
    const town = await runEdge(loadTownData())
    setCommunities(town.communities)
    setSession(town.session)
    setFeed(town.feed)
    setTreeObject(town.treeObject)
    setFlowerGroup(town.flowerGroup)
    setFlowerSingle(town.flowerSingle)
    setBuilding(town.building)
    setGroundTiles(town.groundTiles)
    setCharacterManifest(town.characterManifest)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    loadTown()
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadTown])

  // ---- game events --------------------------------------------------

  const handleEnterCommunity = useCallback((id: number) => {
    // Save session + track the active community. Phaser's InteriorScene
    // handles the visual transition inside the canvas; the React page
    // just records the id (for the activeCommunityId prop that PhaserGame
    // forwards back into its registry).
    setActiveCommunityId(id)
    saveGameSession({ last_area: 'house', last_community_id: id }).catch(() => {})
  }, [])

  // Each board's "open content list" action — for the demo every board
  // points at the same external URL. The game module knows nothing about
  // this; it just emits the board id and the page decides.
  const handleOpenBoard = useCallback(() => {
    window.open(DEMO_BOARD_URL, '_blank', 'noopener,noreferrer')
  }, [])

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
    loadTown().catch((e) => setError(e.message))
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
        <h2>CAN'T REACH THE VILLAGE</h2>
        <p className="error-detail">{error}</p>
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
        treeObject={treeObject}
        flowerGroup={flowerGroup}
        flowerSingle={flowerSingle}
        building={building}
        groundTiles={groundTiles}
        characterManifest={characterManifest}
        dailyBrief={
          <DailyBriefShortcut items={feed} onClose={handleDailyBriefClose} />
        }
        activeCommunityId={activeCommunityId}
        onEnterCommunity={handleEnterCommunity}
        onExitCommunity={handleExitCommunity}
        onOpenBoard={handleOpenBoard}
        trainerDefeated={trainerDefeated}
        onTrainerDefeated={() => setTrainerDefeated(true)}
      />
    </>
  )
}
