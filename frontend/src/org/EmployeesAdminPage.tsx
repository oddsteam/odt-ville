import { useEffect, useState } from 'react'
import { EmployeesService } from './service.ts'
import type { Employee } from './schema.ts'
import { runEdge } from '../lib/runEdge.ts'

// The org roster (#388, ADR-0016) — the first page of the `org` frontend module
// ADR-0010 anticipated.
//
// Read-only, and not as a first slice: this app is a downstream consumer of org
// data, assignment happens upstream, and an edit offered here would be silently
// destroyed by the next sync. So there are no buttons — deliberately.
//
// The admin-* classes come from admin.css, which AdminLayout imports; this page
// only ever renders inside that Outlet. Importing the stylesheet here would
// reach past the admin module's public surface (`pnpm arch` says so), and the
// console chrome is the layout's to own, not a page's.
export default function EmployeesAdminPage() {
  const [employees, setEmployees] = useState<readonly Employee[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    runEdge(EmployeesService.list()).then(setEmployees, (e: Error) => setError(e.message))
  }, [])

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!employees) return <p className="admin-msg">Loading roster…</p>

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Employees</h2>
      <p className="admin-hint">
        {employees.length} on the roster, {employees.filter((e) => !e.left_on).length} current. Read
        from the upstream directory and never edited here — a change made in this app would be
        overwritten by the next sync.
      </p>

      {employees.length === 0 ? (
        <p className="admin-msg">No one on the roster yet — run `rake org:import_roster`.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Nickname</th>
              <th>Name</th>
              <th>Email</th>
              <th>Joined</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              // A departed person stays on the roster; the row just reads dim,
              // the same way a disabled catalog row does.
              <tr key={e.id} className={e.left_on ? 'admin-row-off' : undefined}>
                <td>{e.nickname || '—'}</td>
                <td>{e.name}</td>
                <td>{e.email}</td>
                <td>{e.join_date ?? '—'}</td>
                <td>{e.left_on ? `Left ${e.left_on}` : 'Current'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
