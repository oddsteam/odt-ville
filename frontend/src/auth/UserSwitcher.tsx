import { useState } from 'react'

import { DEV_USERS, switchUser } from './keycloak.ts'

// Dev-only one-click user switcher (issue #93). Renders a row of seeded realm
// users; clicking one performs a password grant and swaps the stored bearer
// token so the whole app re-fetches as that user. Two browser windows on
// different users exercise presence/multiplayer without a login dance.
//
// This component is rendered only behind an `import.meta.env.DEV` gate (see
// RootLayout), so it — and its keycloak client — drop out of production builds.
export default function UserSwitcher() {
  const [active, setActive] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function become(username: string) {
    setPending(true)
    setError(null)
    try {
      await switchUser(username)
      setActive(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="dev-switcher" title="Dev only — become a seeded user">
      <span className="dev-switcher-label">DEV</span>
      {DEV_USERS.map((u) => (
        <button
          key={u.username}
          type="button"
          className={
            'dev-switcher-user' + (active === u.username ? ' is-active' : '')
          }
          disabled={pending}
          onClick={() => become(u.username)}
        >
          {u.username}
        </button>
      ))}
      {error && <span className="dev-switcher-error">auth failed</span>}
    </div>
  )
}
