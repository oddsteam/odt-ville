import { useCallback, useEffect, useState } from 'react'
import VillageGame from './game/VillageGame.jsx'
import CommunitiesAdminPanel from './communities/CommunitiesAdminPanel.jsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.jsx'
import { listCommunities, getFeed } from './communities/client.js'
import { getGameSession, saveGameSession } from './game-session/client.js'
import keycloak, { authEnabled } from './auth/keycloak.js'
import { authFetch } from './auth/authFetch.js'

// Demo target for every board's "open content list" action. Replaced in a
// follow-up by per-board content-list views (see issue #15 follow-ups).
const DEMO_BOARD_URL = 'https://odt-sit.dev.krungthai.com/'

// Tiny inline fetch for the current viewer — the header above the game.
// Kept inline (rather than its own client module) because there is only one
// endpoint and no reason for a third boundary.
async function getMe() {
  const res = await authFetch('/api/v1/me')
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
  // Top-level navigation: 'village' (the game) | 'admin' (the community
  // CRUD console). Keeping admin out of the game module is what makes
  // <VillageGame> a true black box — see issue #13 / PR.
  const [view, setView] = useState('village')

  // PR-E retired the DOM engine; the village game now always runs on
  // Phaser, which owns its own scene transitions inside the canvas. The
  // shell just tracks which community the player is inside (for the
  // active-community-id prop / topbar label).
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

  const handleEnterCommunity = useCallback((id) => {
    // Save session + track the active community. Phaser's InteriorScene
    // handles the visual transition inside the canvas; the React shell
    // just records the id (for the topbar label and the activeCommunityId
    // prop that PhaserGame forwards back into its registry).
    setActiveCommunityId(id)
    saveGameSession({ last_area: 'house', last_community_id: id }).catch(() => {})
  }, [])

  // Each board's "open content list" action — for the demo every board
  // points at the same external URL. The game module knows nothing about
  // this; it just emits the board id and the shell decides.
  const handleOpenBoard = useCallback(() => {
    window.open(DEMO_BOARD_URL, '_blank', 'noopener,noreferrer')
  }, [])

  const handleExitCommunity = useCallback(
    (idFromCaller) => {
      // Phaser passes the exited community id via the bus event; fall
      // back to whatever the shell most recently tracked as active.
      const id = idFromCaller ?? activeCommunityId
      // Optimistic local session update so the next remount (e.g. after
      // an admin tab switch) spawns on the just-exited doormat rather
      // than whatever the previous loadTown returned. Phaser's own
      // scene-start data covers the within-session spawn.
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

  // Tab switch: opening Admin clears the active community so the user
  // lands back in town when they return to the village tab. VillageGame
  // unmounts on tab switch and Phaser starts fresh at the Town Entrance
  // / saved doormat on return — no React-side scene state to reset.
  const goToAdmin = useCallback(() => {
    setActiveCommunityId(null)
    setView('admin')
  }, [])

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
          <p>LOADING ODT VILLAGE…</p>
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
            <h1>ODT VILLAGE</h1>
            <p className="app-company">{me.company.name}</p>
          </div>
        </div>
        <div className="app-user">
          <span className="app-user-name">{me.user.name}</span>
          <span className="app-user-role">{me.user.role}</span>
          {authEnabled && (
            <button
              type="button"
              className="app-logout"
              onClick={() => keycloak.logout()}
            >
              LOG OUT
            </button>
          )}
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
        {view === 'village' && (
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
