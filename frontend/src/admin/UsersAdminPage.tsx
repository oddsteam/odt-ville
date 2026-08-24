import { useEffect, useState } from 'react'
import { AdminUsersService } from '../auth/service.ts'
import { ViewerService } from '../viewer/service.ts'
import type { AdminUser } from '../auth/schema.ts'
import { hasAdmin, revokeControl, rowBadges } from './roleBadges.ts'
import { createPayload, siteOptions } from './clientOnboarding.ts'
import { EmployeesService } from '../org/service.ts'
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
  // Per-row grant state, keyed by user id: the id currently being granted, and
  // the last grant error to render inline on its row. On success we swap in the
  // server's updated row, so the badge flips without a reload; on failure the
  // row's true badges stay put and the error appears beside them (#431).
  const [granting, setGranting] = useState<number | null>(null)
  const [revoking, setRevoking] = useState<number | null>(null)
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null)
  // The caller's own user id, so the revoke control is disabled on their own row
  // — you cannot revoke your own admin without locking yourself out (#432). The
  // server refuses it too (422); this just stops the button being offered.
  const [meId, setMeId] = useState<number | null>(null)
  // The pre-provision form (#500): create a Client login by email before their
  // first sign-in. `external` defaults on — pre-provisioning is the Client flow;
  // a staff member provisions themselves at first login.
  const [newEmail, setNewEmail] = useState('')
  const [newExternal, setNewExternal] = useState(true)
  const [newSite, setNewSite] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  // Per-row edit state: the id currently saving, and a client_site draft keyed
  // by user id so each row's text input edits independently before its Save.
  const [savingId, setSavingId] = useState<number | null>(null)
  const [siteDrafts, setSiteDrafts] = useState<Record<number, string>>({})
  // The Site names for the client-site pickers (#503 endpoint). A bare list
  // keeps admins from typing a site that has no buildings (empty town).
  const [sites, setSites] = useState<readonly string[]>([])

  useEffect(() => {
    runEdge(AdminUsersService.list()).then(setUsers, (e: Error) => setError(e.message))
    runEdge(ViewerService.get()).then((v) => setMeId(v.user.id), () => {})
    runEdge(EmployeesService.listSites()).then(setSites, () => setSites([]))
  }, [])

  function makeAdmin(id: number) {
    setGranting(id)
    setRowError(null)
    runEdge(AdminUsersService.grant(id, 'admin')).then(
      (updated) => {
        setGranting(null)
        setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev)
      },
      (e: Error) => {
        setGranting(null)
        setRowError({ id, message: e.message })
      },
    )
  }

  // Pre-provision a Client by email (#500). The server returns the created row;
  // splice it in name-ordered so the table matches the roster's ordering.
  function preProvision() {
    const payload = createPayload({ email: newEmail, external: newExternal, clientSite: newSite })
    if (!payload.email) {
      setCreateError('Enter an email to pre-provision.')
      return
    }
    setCreating(true)
    setCreateError(null)
    runEdge(AdminUsersService.create(payload)).then(
      (created) => {
        setCreating(false)
        setUsers((prev) =>
          [...(prev ?? []), created].sort((a, b) => a.name.localeCompare(b.name)),
        )
        setNewEmail('')
        setNewSite('')
        setNewExternal(true)
      },
      (e: Error) => {
        setCreating(false)
        setCreateError(e.message)
      },
    )
  }

  // Set external and/or client_site on an existing user (#500). Swaps in the
  // server's updated row so the console reflects it without a reload.
  function saveEdit(id: number, patch: { external?: boolean; client_site?: string | null }) {
    setSavingId(id)
    setRowError(null)
    runEdge(AdminUsersService.update(id, patch)).then(
      (updated) => {
        setSavingId(null)
        setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev)
      },
      (e: Error) => {
        setSavingId(null)
        setRowError({ id, message: e.message })
      },
    )
  }

  function revoke(id: number, role: string) {
    setRevoking(id)
    setRowError(null)
    runEdge(AdminUsersService.revoke(id, role)).then(
      (updated) => {
        setRevoking(null)
        setUsers((prev) => prev?.map((u) => (u.id === id ? updated : u)) ?? prev)
      },
      (e: Error) => {
        setRevoking(null)
        // Leave the row's true badges put; a failed revoke must never leave the
        // badge showing the wrong state (#432).
        setRowError({ id, message: e.message })
      },
    )
  }

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

      {/* Pre-provision a Client by email (#500): create the login before their
          first sign-in and Keycloak account. On first login they are matched by
          email and land in their site's town — no downtown, no empty state. */}
      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault()
          preProvision()
        }}
      >
        <input
          type="email"
          placeholder="client@company.example"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
        />
        <select
          aria-label="Client site"
          value={newSite}
          onChange={(e) => setNewSite(e.target.value)}
        >
          <option value="">No site (unassigned)</option>
          {siteOptions(sites, newSite).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={newExternal}
            onChange={(e) => setNewExternal(e.target.checked)}
          />{' '}
          External (Client)
        </label>
        <button type="submit" disabled={creating}>
          {creating ? 'Adding…' : 'Pre-provision'}
        </button>
        {createError ? <span className="admin-msg-error"> {createError}</span> : null}
      </form>

      {users.length === 0 ? (
        <p className="admin-msg">No one has logged in yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Client</th>
              <th>Client site</th>
              <th>Roles</th>
              <th></th>
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
                    <label title="External Client (no downtown) vs Staff">
                      <input
                        type="checkbox"
                        checked={u.external === true}
                        disabled={savingId === u.id}
                        onChange={(e) => saveEdit(u.id, { external: e.target.checked })}
                      />
                    </label>
                  </td>
                  <td>
                    <select
                      aria-label={`Client site for ${u.name}`}
                      value={siteDrafts[u.id] ?? u.client_site ?? ''}
                      onChange={(e) =>
                        setSiteDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {siteOptions(sites, siteDrafts[u.id] ?? u.client_site ?? '').map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>{' '}
                    <button
                      type="button"
                      disabled={savingId === u.id}
                      onClick={() =>
                        saveEdit(u.id, { client_site: siteDrafts[u.id] ?? u.client_site ?? '' })
                      }
                    >
                      {savingId === u.id ? 'Saving…' : 'Save'}
                    </button>
                  </td>
                  <td>
                    {badges.length === 0
                      ? '—'
                      : badges.map((b) => {
                          const revoke_ = revokeControl(b, u.id === meId)
                          return (
                            <span key={b.key}>
                              {b.role} ({b.source})
                              {b.grantedBy ? ` — granted by ${b.grantedBy}` : ''}
                              {b.grantedAt ? ` on ${b.grantedAt.slice(0, 10)}` : ''}{' '}
                              <button
                                type="button"
                                disabled={!revoke_.enabled || revoking === u.id}
                                title={revoke_.title}
                                onClick={() => revoke(u.id, b.role)}
                              >
                                {revoking === u.id ? 'Revoking…' : 'Revoke'}
                              </button>{' '}
                            </span>
                          )
                        })}
                  </td>
                  <td>
                    {hasAdmin(u.roles) ? null : (
                      <button
                        type="button"
                        disabled={granting === u.id}
                        onClick={() => makeAdmin(u.id)}
                      >
                        {granting === u.id ? 'Granting…' : 'Make admin'}
                      </button>
                    )}
                    {rowError?.id === u.id ? (
                      <span className="admin-msg-error"> {rowError.message}</span>
                    ) : null}
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
