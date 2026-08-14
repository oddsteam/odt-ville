import { useEffect, useState } from 'react'
import { EmployeesService } from './service.ts'
import type { Employee } from './schema.ts'
import { bySite, siteNames } from './siteFilter.ts'
import { BasecampPersonPicker } from './BasecampPersonPicker.tsx'
import { runEdge } from '../lib/runEdge.ts'

// The org roster (#388, ADR-0016) — the first page of the `org` frontend module
// ADR-0010 anticipated.
//
// Read-only over org data: this app is a downstream consumer, assignment happens
// upstream, and an edit offered here would be silently destroyed by the next
// sync. The one exception is the Basecamp link (#392) — a fact about our own
// integration, not about org data, so a human is its authority and the sync
// preserves it. That is the only column with buttons.
//
// The admin-* classes come from admin.css, which AdminLayout imports; this page
// only ever renders inside that Outlet. Importing the stylesheet here would
// reach past the admin module's public surface (`pnpm arch` says so), and the
// console chrome is the layout's to own, not a page's.
export default function EmployeesAdminPage() {
  const [employees, setEmployees] = useState<readonly Employee[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [site, setSite] = useState('')
  // Which employee's picker is open, by id — one at a time.
  const [picking, setPicking] = useState<number | null>(null)

  useEffect(() => {
    runEdge(EmployeesService.list()).then(setEmployees, (e: Error) => setError(e.message))
  }, [])

  // Set or clear the Basecamp link (#392) and swap the returned row in place, so
  // the Basecamp cell reflects it without a reload. The avatar itself resolves
  // on the next sync, which now reaches this person by the hand-set id.
  const applyLink = (employeeId: number, basecampPersonId: number | null) => {
    setPicking(null)
    runEdge(EmployeesService.linkBasecampPerson(employeeId, basecampPersonId)).then(
      (updated) => setEmployees((prev) => prev?.map((e) => (e.id === employeeId ? updated : e)) ?? prev),
      (e: Error) => setError(e.message),
    )
  }

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!employees) return <p className="admin-msg">Loading roster…</p>

  const shown = bySite(employees, site)

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Employees</h2>
      <p className="admin-hint">
        {employees.length} on the roster, {employees.filter((e) => !e.left_on).length} current,{' '}
        {employees.filter((e) => e.linked).length} with a login,{' '}
        {employees.filter((e) => !e.basecamp_linked).length} with no Basecamp link. Read
        from the upstream directory and never edited here — a change made in this app would be
        overwritten by the next sync.
      </p>

      {/* A native <select>, not a search box: the site set is small and closed,
          and picking from it is the whole interaction. There is deliberately no
          control to assign one — that happens upstream (#389). */}
      <label className="admin-hint">
        Site{' '}
        <select value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">All sites</option>
          {siteNames(employees).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>{' '}
        {site && `— ${shown.length} placed here`}
      </label>

      {employees.length === 0 ? (
        <p className="admin-msg">No one on the roster yet — run `rake org:import_roster`.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nickname</th>
              <th>Name</th>
              <th>Email</th>
              <th>Sites</th>
              <th>Joined</th>
              <th>Status</th>
              <th>Login</th>
              <th>Basecamp</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              // A departed person stays on the roster; the row just reads dim,
              // the same way a disabled catalog row does.
              <tr key={e.id} className={e.left_on ? 'admin-row-off' : undefined}>
                <td>{e.nickname || '—'}</td>
                <td>{e.name}</td>
                <td>{e.email}</td>
                <td>{e.sites.map((s) => s.name).join(', ') || '—'}</td>
                <td>{e.join_date ?? '—'}</td>
                <td>{e.left_on ? `Left ${e.left_on}` : 'Current'}</td>
                {/* Not a warning: unlinked means "has not signed in", which is
                    normal, so it reads as a dash rather than a red flag. */}
                <td>{e.linked ? 'Linked' : '—'}</td>
                {/* Unlike Login, this gap is work: no link means no face until
                    someone maps them by hand (#392). Linked rows can be cleared
                    so a wrong pick is recoverable; unlinked rows open a picker. */}
                <td>
                  {e.basecamp_linked ? (
                    <>
                      Linked{' '}
                      <button type="button" onClick={() => applyLink(e.id, null)}>
                        Clear
                      </button>
                    </>
                  ) : picking === e.id ? (
                    <>
                      <BasecampPersonPicker onPick={(pid) => applyLink(e.id, pid)} />
                      <button type="button" onClick={() => setPicking(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setPicking(e.id)}>
                      Link…
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
