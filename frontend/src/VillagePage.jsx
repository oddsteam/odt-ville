import { useCallback, useEffect, useState } from 'react'
import VillageGame from './game/VillageGame.jsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.jsx'
import { listCommunities, getFeed } from './communities/client.js'
import { getGameSession, saveGameSession } from './game-session/client.js'
import { getActiveTileObject } from './tileObjects/client.js'
import { listGroundTiles } from './groundTiles/client.js'
import { loadActiveManifest } from './character/manifest.js'

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
  const [activeCommunityId, setActiveCommunityId] = useState(null)
  // Gate-trainer state — once you've escaped the duel he never challenges
  // again in this session. Lifted to the page so it survives VillageGame
  // remounts when you enter / exit a community.
  const [trainerDefeated, setTrainerDefeated] = useState(false)

  const [communities, setCommunities] = useState(null)
  const [session, setSession] = useState(null)
  const [feed, setFeed] = useState([])
  // The admin-defined tree object (tile-object mapper), rendered by the game.
  // Optional enhancement — null is fine and falls back to the bundled tree.
  const [treeObject, setTreeObject] = useState(null)
  // Ground-tile catalog (ground-tile mapper): grass/dirt/road cells painted
  // onto the town's ground, encounter field, and roads. Empty array falls back
  // to the procedural tile textures, so it's a pure visual enhancement.
  const [groundTiles, setGroundTiles] = useState([])
  // The active character sprite (sprite-mapper manifest). Drives the town
  // player; loadActiveManifest always resolves (remote → committed default).
  const [characterManifest, setCharacterManifest] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Town-scene state — fetched on mount and after any communities-mutating
  // action so the game always sees fresh communities + session + feed.
  const loadTown = useCallback(async () => {
    const [c, s, f, tree, ground, character] = await Promise.all([
      listCommunities(),
      getGameSession(),
      getFeed(),
      // Best-effort: the tree object is a visual enhancement, so swallow any
      // failure (e.g. endpoint not migrated on this env) and fall back to null
      // — never let it break the town load.
      getActiveTileObject('tree').catch(() => null),
      // Ground-tile catalog — same best-effort discipline: an empty list just
      // means the procedural tile textures keep being used.
      listGroundTiles().catch(() => []),
      // The active character sprite. Never throws (falls back to the committed
      // default), so the town always has a player even if the backend is down.
      loadActiveManifest().catch(() => null),
    ])
    setCommunities(c)
    setSession(s)
    setFeed(f)
    setTreeObject(tree)
    setGroundTiles(ground || [])
    setCharacterManifest(character)
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

  const handleEnterCommunity = useCallback((id) => {
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
    (idFromCaller) => {
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
      }))
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
