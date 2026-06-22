import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'

import { runEdge } from './lib/runEdge.ts'
import { ViewerService } from './viewer/service.ts'
import type { Viewer } from './viewer/schema.ts'

// The game shell: brand header + the village game via <Outlet>. The admin
// console is a separate top-level route (see App + AdminLayout) with no link
// from here — it's reached by URL only. `me` is purely for the header, fetched
// best-effort so the game renders even if the viewer endpoint is slow or down.
export default function RootLayout() {
  const [me, setMe] = useState<Viewer | null>(null)

  useEffect(() => {
    let active = true
    runEdge(ViewerService.get())
      .then((m) => active && setMe(m))
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

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
        {me && (
          <div className="app-user">
            <span className="app-user-name">{me.user.name}</span>
            <span className="app-user-role">{me.user.role}</span>
          </div>
        )}
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
