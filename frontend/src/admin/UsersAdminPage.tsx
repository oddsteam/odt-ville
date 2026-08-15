import { useEffect, useState } from 'react'
import { AdminUsersService } from '../auth/service.ts'
import type { AdminUser } from '../auth/schema.ts'
import { rowBadges } from './roleBadges.ts'
import { runEdge } from '../lib/runEdge.ts'

// The read-only admin roster (#430): who has logged in, and who is an admin
// right now. Each admin badge shows its source — App (an auth_user_roles grant,
// #429) or Keycloak (a realm role) — because the grant/revoke slices (#431,
// #432) can only touch the App ones, and the page has to make that visible
// before it offers a button.
//
// The server can only read the *requesting* user's token, so other users' rows
// carry their App grants only; your own row also shows your Keycloak roles.
//
// The admin-* classes come from admin.css, which AdminLayout imports; this page
// only renders inside that Outlet. Importing the stylesheet here would reach
// past the admin chrome the layout owns.
export default function UsersAdminPage() {
  const [users, setUsers] = useState<readonly AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    runEdge(AdminUsersService.list()).then(setUsers, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!users) return <p className="admin-msg">Loading users…</p>

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Users</h2>
      <p className="admin-hint">
        {users.length} {users.length === 1 ? 'person has' : 'people have'} logged in. An{' '}
        <strong>admin</strong> badge shows its source — <em>App</em> (granted here) or{' '}
        <em>Keycloak</em> (a realm role). Only your own Keycloak roles are visible: the server
        cannot read another user's token.
      </p>

      {users.length === 0 ? (
        <p className="admin-msg">No one has logged in yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const badges = rowBadges(u.roles)
              return (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email ?? '—'}</td>
                  <td>
                    {badges.length === 0
                      ? '—'
                      : badges.map((b) => (
                          <span key={b.key}>
                            {b.role} ({b.source}){' '}
                          </span>
                        ))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
