import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { MapSummary } from '../maps/service.ts'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Map picker — decouples collision painting from create/import (#131 follow-up).
// Lists saved maps identity-only (GET /maps); pick one to paint its collision,
// or open it in play. "New map" routes to the create/import editor.
export default function MapsListPage() {
  const [maps, setMaps] = useState<readonly MapSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Delete a saved map after a native confirm — destructive and rare, so the
  // browser prompt is enough; the row drops from the list on success.
  const remove = (m: MapSummary) => {
    if (!window.confirm(`Delete map "${m.title}" (${m.slug})? This cannot be undone.`)) return
    runEdge(MapsService.destroy(m.slug))
      .then(() => setMaps((prev) => prev?.filter((x) => x.slug !== m.slug) ?? prev))
      .catch((e) => setError((e as Error).message))
  }

  useEffect(() => {
    let live = true
    runEdge(MapsService.list())
      .then((m) => live && setMaps(m))
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Maps</h1>
      <p>
        <Link to="new">+ New map</Link>
      </p>

      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {!maps && !error && <p className="admin-msg">Loading maps…</p>}
      {maps && maps.length === 0 && (
        <p className="admin-hint">No maps yet — create one to get started.</p>
      )}

      {maps && maps.length > 0 && (
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              <th style={{ padding: '4px 16px 4px 0' }}>Title</th>
              <th style={{ padding: '4px 16px 4px 0' }}>Slug</th>
              <th style={{ padding: '4px 16px 4px 0' }}>Size</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {maps.map((m) => (
              <tr key={m.slug}>
                <td style={{ padding: '4px 16px 4px 0' }}>{m.title}</td>
                <td style={{ padding: '4px 16px 4px 0' }}>{m.slug}</td>
                <td style={{ padding: '4px 16px 4px 0' }}>
                  {m.cols}×{m.rows}
                </td>
                <td style={{ padding: '4px 16px 4px 0' }}>
                  <Link to={`${m.slug}/decorate`}>Decorate</Link>
                  {' · '}
                  <Link to={`/maps/${m.slug}`}>Play</Link>
                  {' · '}
                  <button
                    type="button"
                    onClick={() => remove(m)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: '#b91c1c',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      font: 'inherit',
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
