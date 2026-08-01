import { useCallback, useEffect, useState } from 'react'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import { TileObjectsWrite } from '../catalog/tileObjects/write.ts'
import type { TileObjectSummary } from '../catalog/tileObjects/schema.ts'
import type * as Effect from 'effect/Effect'
import { runEdge, type AppContext } from '../lib/runEdge.ts'

// The saved-objects roster (#27, redesigned #35) — which tile objects exist,
// which is the active one of its kind, and the activate/deactivate/delete/edit
// actions on each. It owns its own list, so a save elsewhere on the page just
// bumps `reloadKey`. Split out of TileMapper.tsx in #353.

export default function SavedObjects({
  reloadKey, onEdit, onError,
}: {
  reloadKey: number // bump to refetch — a save upserts a record into this list
  onEdit: (id: number) => void
  onError: (message: string) => void
}) {
  const [saved, setSaved] = useState<readonly TileObjectSummary[]>([])
  const refresh = useCallback(() => {
    runEdge(TileObjectsService.list()).then(setSaved).catch(() => {})
  }, [])
  useEffect(() => refresh(), [refresh, reloadKey])

  const run = useCallback(
    (what: string, work: Effect.Effect<unknown, unknown, AppContext>) => {
      runEdge(work)
        .then(() => refresh())
        .catch((err: unknown) => onError(`${what} failed: ${err instanceof Error ? err.message : String(err)}`))
    },
    [refresh, onError],
  )

  // Deletes are irreversible, so confirm first; if it was the active one of its
  // kind, the game falls back to the default art (#35).
  const onDelete = (o: TileObjectSummary) => {
    if (!window.confirm(`Delete "${o.name}"? This can't be undone.`)) return
    run('Delete', TileObjectsWrite.del(o.id))
  }

  return (
    <>
      <h3>Saved objects</h3>
      <ul className="saved-list">
        {saved.length === 0 && <li className="hint">No saved objects yet.</li>}
        {saved.map((o) => (
          <li key={o.id} className={o.active ? 'is-active' : ''}>
            <div className="saved-head">
              <span className="saved-name">{o.name}</span>
              {o.active && <span className="saved-badge">active</span>}
            </div>
            <div className="saved-meta">
              <span className="saved-kind">{o.kind}</span>
              <span className="saved-fp">{o.footprint_w}×{o.footprint_h}</span>
            </div>
            <div className="saved-actions">
              <button type="button" onClick={() => onEdit(o.id)}>
                Edit
              </button>
              {o.active ? (
                <button type="button" onClick={() => run('Deactivate', TileObjectsWrite.deactivate(o.id))}>
                  Deactivate
                </button>
              ) : (
                <button type="button" onClick={() => run('Activate', TileObjectsWrite.activate(o.id))}>
                  Activate
                </button>
              )}
              <button type="button" className="danger" onClick={() => onDelete(o)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
