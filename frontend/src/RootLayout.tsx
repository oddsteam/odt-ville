import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { runEdge } from './lib/runEdge.ts'
import { subscribeAuthToken } from './lib/authToken.ts'
import UserSwitcher from './auth/UserSwitcher.tsx'
import LogoutButton from './auth/LogoutButton.tsx'
import { ViewerService } from './viewer/service.ts'
import { trackSessionActiveTime } from './analytics/sessionTime.ts'
import type { Viewer } from './viewer/schema.ts'

// The game shell: brand header + the village game via <Outlet>. The admin
// console is a separate top-level route (see App + AdminLayout) with no link
// from here — it's reached by URL only. `me` is purely for the header, fetched
// best-effort so the game renders even if the viewer endpoint is slow or down.
export default function RootLayout() {
  const [me, setMe] = useState<Viewer | null>(null)

  const refetchMe = useCallback(() => {
    let active = true
    runEdge(ViewerService.get())
      .then((m) => active && setMe(m))
      .catch(() => active && setMe(null))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => refetchMe(), [refetchMe])

  // Re-fetch app state whenever the active user is swapped (dev switcher). The
  // store is a no-op in production where nothing writes a token.
  useEffect(() => subscribeAuthToken(refetchMe), [refetchMe])

  // Track foreground game-tab time for the whole session (#104). Mounted once
  // at the shell so it spans every route; emits session_active_time on unload.
  useEffect(() => trackSessionActiveTime(), [])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <span className="app-logo">🕹️</span>
          <div>
            <h1>ODT VILLE</h1>
            {me && <p className="app-company">{me.company.name}</p>}
          </div>
        </div>
        <div className="app-header-right">
          {import.meta.env.DEV && <UserSwitcher />}
          {me && (
            <div className="app-user">
              <span className="app-user-name">{me.user.name}</span>
              <span className="app-user-role">{me.user.role}</span>
            </div>
          )}
          {me && <LogoutButton className="app-logout" />}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
