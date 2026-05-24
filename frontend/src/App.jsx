import { useCallback, useEffect, useState } from 'react'
import VillageGame from './game/VillageGame.jsx'
import CommunityView from './communities/CommunityView.jsx'
import CommunitiesAdminPanel from './communities/CommunitiesAdminPanel.jsx'
import DailyBriefShortcut from './communities/DailyBriefShortcut.jsx'
import {
  listCommunities,
  getCommunity,
  getFeed,
} from './communities/client.js'
import { getGameSession, saveGameSession } from './game-session/client.js'

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

  const [scene, setScene] = useState('town')
  const [activeCommunityId, setActiveCommunityId] = useState(null)
  const [communityDetail, setCommunityDetail] = useState(null)

  const [me, setMe] = useState(null)
  const [communities, setCommunities] = useState(null)
  const [session, setSession] = useState(null)
  const [feed, setFeed] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [communityLoading, setCommunityLoading] = useState(false)

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

  const handleEnterCommunity = useCallback(async (id) => {
    setCommunityLoading(true)
    setError(null)
    try {
      const detail = await getCommunity(id)
      setCommunityDetail(detail)
      setActiveCommunityId(id)
      setScene('community')
      saveGameSession({ last_area: 'house', last_community_id: id }).catch(() => {})
    } catch (e) {
      setError(e.message)
    } finally {
      setCommunityLoading(false)
    }
  }, [])

  const handleExitCommunity = useCallback(() => {
    const id = activeCommunityId
    // Optimistic local session update: <VillageGame> remounts on the next
    // render and initialises the player tile from `session.spawn.last_community_id`
    // via useState. If we leave the in-memory session pointing at whatever the
    // previous loadTown returned, the player visually lands on the *previous*
    // visited community's doormat. Updating session here, before setScene,
    // ensures the just-exited community is the spawn. saveGameSession + loadTown
    // still run for server-side persistence and other state.
    setSession((prev) => ({
      ...(prev || {}),
      last_area: 'town',
      last_community_id: id,
      spawn: { area: 'town', last_community_id: id },
    }))
    saveGameSession({ last_area: 'town', last_community_id: id }).catch(() => {})
    setScene('town')
    setCommunityDetail(null)
    setActiveCommunityId(null)
    loadTown().catch((e) => setError(e.message))
  }, [activeCommunityId, loadTown])

  // Tab switch: opening Admin from inside a community treats it like Exit so
  // the user lands back in town when they return to the village tab.
  const goToAdmin = useCallback(() => {
    if (scene === 'community') {
      setScene('town')
      setCommunityDetail(null)
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
        {view === 'village' && scene === 'town' && (
          <VillageGame
            communities={communities}
            session={session}
            dailyBrief={
              <DailyBriefShortcut items={feed} onClose={handleDailyBriefClose} />
            }
            onEnterCommunity={handleEnterCommunity}
          />
        )}

        {view === 'village' && scene === 'community' && communityDetail && (
          <CommunityView
            communityData={communityDetail}
            onExit={handleExitCommunity}
          />
        )}

        {view === 'admin' && (
          <CommunitiesAdminPanel
            communities={communities}
            onChanged={loadTown}
          />
        )}

        {communityLoading && (
          <div className="scene-loading-overlay">
            <div className="loading-pixel" />
            <p>ENTERING…</p>
          </div>
        )}
      </main>
    </div>
  )
}
