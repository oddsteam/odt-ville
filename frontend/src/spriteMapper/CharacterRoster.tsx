import { useCallback, useEffect, useState } from 'react'
import AnimPreview from './AnimPreview.tsx'
import {
  POSTURE_KEYS,
  normalizeManifest,
  resolveSheetSrc,
} from '../kernel/characterManifest.js'
import { CharacterService } from '../character/service.ts'
import { runEdge } from '../lib/runEdge.ts'

// Roster of every saved character, each shown as a looping animation. Lives in
// the sprite-mapper (the admin authoring page) and refreshes whenever a save
// bumps `reloadSignal`. "Load" pulls a character back into the editor;
// "Make active" promotes it to the one live character the game renders.
//
// The index endpoint is blob-free, so we fetch each manifest's full data
// (sheet + postures) to animate it.

type FrameRect = { x: number; y: number; w: number; h: number }
type ManifestRow = {
  id: number
  name: string
  active: boolean
  updated_at: string
  manifest: any
}

type Props = {
  reloadSignal: number
  onLoad: (m: any) => void
}

// The posture to preview: a walking Down loop reads best; fall back to idle
// Down, then to whatever posture has frames.
function previewFrames(m: any): FrameRect[] {
  if (m.postures?.walkDown?.length) return m.postures.walkDown
  if (m.postures?.idleDown?.length) return m.postures.idleDown
  for (const k of POSTURE_KEYS) {
    if (m.postures?.[k]?.length) return m.postures[k]
  }
  return []
}

export default function CharacterRoster({ reloadSignal, onLoad }: Props) {
  const [rows, setRows] = useState<ManifestRow[]>([]) // [{ id, name, active, manifest }]
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const summaries = await runEdge(CharacterService.list())
      const full = await Promise.all(
        summaries.map(async (s: any) => {
          const data = await runEdge(CharacterService.getById(s.id)).catch(() => null)
          return { ...s, manifest: data ? normalizeManifest(data) : null }
        }),
      )
      setRows(full.filter((r: any) => r.manifest))
    } catch (err: unknown) {
      setError(`Could not load the roster: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, reloadSignal])

  const makeActive = useCallback(
    async (m: any) => {
      setBusy(true)
      try {
        await runEdge(CharacterService.save(normalizeManifest(m)))
        await refresh()
      } catch (err: unknown) {
        setError(`Activate failed: ${err instanceof Error ? err.message : String(err)}`)
        setBusy(false)
      }
    },
    [refresh],
  )

  return (
    <div className="roster">
      <div className="roster-head">
        <h3>Saved characters{rows.length ? ` (${rows.length})` : ''}</h3>
        <button type="button" onClick={refresh} disabled={busy}>
          {busy ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="roster-error">{error}</div>}
      {!busy && !rows.length && !error && (
        <p className="hint">No saved characters yet. Save one to see it here.</p>
      )}

      <div className="roster-grid">
        {rows.map((r) => (
          <div key={r.id} className={`roster-card${r.active ? ' is-active' : ''}`}>
            <div className="roster-anim">
              <AnimPreview
                sheet={{ src: resolveSheetSrc(r.manifest) }}
                frames={previewFrames(r.manifest)}
                frameRate={r.manifest.frameRate || 9}
                scale={2}
              />
            </div>
            <div className="roster-name">
              {r.name}
              {r.active && <span className="roster-badge">active</span>}
            </div>
            <div className="roster-actions">
              <button type="button" onClick={() => onLoad(r.manifest)} disabled={busy}>
                Load
              </button>
              <button
                type="button"
                onClick={() => makeActive(r.manifest)}
                disabled={busy || r.active}
              >
                Make active
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
