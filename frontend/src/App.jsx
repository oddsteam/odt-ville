import { useCallback, useEffect, useMemo, useState } from 'react'
import VillageGame from './game/VillageGame.jsx'
import CommunityInterior from './game/CommunityInterior.jsx'
import CommunitiesAdminPanel from './communities/CommunitiesAdminPanel.jsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.jsx'
import { listCommunities, getFeed } from './communities/client.js'
import { getGameSession, saveGameSession } from './game-session/client.js'
import { readEngineFlag } from './game/engineFlag.js'

// Demo target for every board's "open content list" action. Replaced in a
// follow-up by per-board content-list views (see issue #15 follow-ups).
const DEMO_BOARD_URL = 'https://onerev-sit.dev.krungthai.com/'

// Tiny inline fetch for the current viewer — the header above the game.
// Kept inline (rather than its own client module) because there is only one
// endpoint and no reason for a third boundary.
async function getMe() {
  const res = await fetch('/api/v1/me')
  if (!res.ok) throw new Error(`Request to /me failed (${res.status})`)
  return res.json()
}

// The app shell composes three independent modules:
//   - communities client (`./communities/client`)   — CRUD + content feed
//   - game-session client (`./game-session/client`) — spawn + last visited
//   - the village game (`./game/VillageGame`)        — black-box React component
// It hands data to the game via props, listens for game events, and persists
// session changes. Nothing here knows about tiles, sprites, or encounters.
export default function App() {
  // Top-level navigation: 'village' (the game + community detail) | 'admin'
  // (the community CRUD console). Keeping admin out of the game module is
  // what makes <VillageGame> a true black box — see issue #13 / PR.
  const [view, setView] = useState('village')

  // Engine flag — used to gate the DOM community-interior mount. Under
  // Phaser the InteriorScene lives on the canvas, so the React shell
  // never mounts the DOM <CommunityInterior> alongside it.
  const engine = useMemo(readEngineFlag, [])

  const [scene, setScene] = useState('town')
  const [activeCommunityId, setActiveCommunityId] = useState(null)
  // Gate-trainer state — once you've escaped the duel he never challenges
  // again in this session. Lifted to the shell so it survives VillageGame
  // remounts when you enter / exit a community.
  const [trainerDefeated, setTrainerDefeated] = useState(false)

  const [me, setMe] = useState(null)
  const [communities, setCommunities] = useState(null)
  const [session, setSession] = useState(null)
  const [feed, setFeed] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Town-scene state — fetched on mount and after any communities-mutating
  // action so the game always sees fresh communities + session + feed.
  const loadTown = useCallback(async () => {
    const [c, s, f] = await Promise.all([
      listCommunities(),
      getGameSession(),
      getFeed(),
    ])
    setCommunities(c)
    setSession(s)
    setFeed(f)
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([getMe(), loadTown()])
      .then(([m]) => {
        if (!active) return
        setMe(m)
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [loadTown])

  // ---- game events --------------------------------------------------

  const handleEnterCommunity = useCallback(
    (id) => {
      // Both engines save session + track the active community. Only the
      // DOM engine flips `scene` to mount <CommunityInterior>; under
      // Phaser the InteriorScene runs inside the canvas and the React
      // `scene` state stays on 'town' the whole time.
      setActiveCommunityId(id)
      if (engine === 'dom') setScene('community-interior')
      saveGameSession({ last_area: 'house', last_community_id: id }).catch(() => {})
    },
    [engine],
  )

  // Each board's "open content list" action — for the demo every board
  // points at the same external URL. The game module knows nothing about
  // this; it just emits the board id and the shell decides.
  const handleOpenBoard = useCallback(() => {
    window.open(DEMO_BOARD_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const handleExitCommunity = useCallback(
    (idFromCaller) => {
      // DOM engine calls this without args (onExit from <CommunityInterior>);
      // Phaser passes the exited community id via the bus event.
      const id = idFromCaller ?? activeCommunityId
      // Optimistic local session update: under the DOM engine,
      // <VillageGame> remounts on the next render and initialises the
      // player tile from `session.spawn.last_community_id` via useState.
      // Updating session here, before setScene, ensures the just-exited
      // community is the spawn (otherwise the player lands on whatever
      // the previous loadTown returned). Under Phaser the scene-start
      // data already does the spawn, so this is purely for the next
      // load.
      setSession((prev) => ({
        ...(prev || {}),
        last_area: 'town',
        last_community_id: id,
        spawn: { area: 'town', last_community_id: id },
      }))
      saveGameSession({ last_area: 'town', last_community_id: id }).catch(() => {})
      if (engine === 'dom') setScene('town')
      setActiveCommunityId(null)
      loadTown().catch((e) => setError(e.message))
    },
    [activeCommunityId, engine, loadTown],
  )

  // Tab switch: opening Admin from inside a community treats it like Exit so
  // the user lands back in town when they return to the village tab.
  const goToAdmin = useCallback(() => {
    if (scene !== 'town') {
      setScene('town')
      setActiveCommunityId(null)
    }
    setView('admin')
  }, [scene])

  const goToVillage = useCallback(() => {
    setView('village')
  }, [])

  const handleDailyBriefClose = useCallback(() => {
    loadTown().catch((e) => setError(e.message))
  }, [loadTown])

  // ---- Render states ------------------------------------------------

  if (loading && !communities) {
    return (
      <div className="app-shell app-centered">
        <div className="loading-card">
          <div className="loading-pixel" />
          <p>LOADING ONE REV VILLAGE…</p>
        </div>
      </div>
    )
  }

  if (error && !communities) {
    return (
      <div className="app-shell app-centered">
        <div className="error-card">
          <h2>CAN'T REACH THE VILLAGE</h2>
          <p className="error-detail">{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            RETRY
          </button>
        </div>
      </div>
    )
  }

  if (!communities || !session || !me) return null

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">🕹️</span>
          <div>
            <h1>ONE REV VILLAGE</h1>
            <p className="app-company">{me.company.name}</p>
          </div>
        </div>
        <div className="app-user">
          <span className="app-user-name">{me.user.name}</span>
          <span className="app-user-role">{me.user.role}</span>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Top-level navigation">
        <button
          type="button"
          className={`app-tab${view === 'village' ? ' app-tab-active' : ''}`}
          onClick={goToVillage}
          aria-current={view === 'village' ? 'page' : undefined}
        >
          🕹️ VILLAGE
        </button>
        <button
          type="button"
          className={`app-tab${view === 'admin' ? ' app-tab-active' : ''}`}
          onClick={goToAdmin}
          aria-current={view === 'admin' ? 'page' : undefined}
        >
          ⚙ ADMIN
        </button>
      </nav>

      {error && communities && (
        <div className="error-banner">
          {error}
          <button type="button" onClick={() => setError(null)}>
            DISMISS
          </button>
        </div>
      )}

      <main className="app-main">
        {view === 'village' && (engine === 'phaser' || scene === 'town') && (
          <VillageGame
            communities={communities}
            session={session}
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
        )}

        {view === 'village' &&
          engine === 'dom' &&
          scene === 'community-interior' &&
          activeCommunityId != null && (
            <CommunityInterior
              community={communities.find((c) => c.id === activeCommunityId)}
              dailyBrief={
                <DailyBriefShortcut items={feed} onClose={handleDailyBriefClose} />
              }
              onExit={handleExitCommunity}
              onOpenBoard={handleOpenBoard}
            />
          )}

        {view === 'admin' && (
          <CommunitiesAdminPanel
            communities={communities}
            onChanged={loadTown}
          />
        )}
      </main>
    </div>
  )
}
