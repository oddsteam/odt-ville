import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

// AnimPreview is presentation-only (canvas playback of frame rects); reused
// from the sprite mapper rather than duplicated. No arch edge is crossed —
// authoring may be imported by the shell-side picker, never the reverse.
import AnimPreview from '../spriteMapper/AnimPreview.tsx'
import { POSTURE_KEYS, normalizeManifest, resolveSheetSrc } from '../kernel/characterManifest.js'
import { CharacterService } from './service.ts'
import { runEdge } from '../lib/runEdge.ts'

type FrameRect = { x: number; y: number; w: number; h: number }
type Row = { id: number; name: string; manifest: any }

// The posture to preview — same order of preference as the admin roster.
function previewFrames(m: any): FrameRect[] {
  if (m.postures?.walkDown?.length) return m.postures.walkDown
  if (m.postures?.idleDown?.length) return m.postures.idleDown
  for (const k of POSTURE_KEYS) {
    if (m.postures?.[k]?.length) return m.postures[k]
  }
  return []
}

// User-facing character picker (#155, ADR-0009): choose which saved manifest
// the game renders for *you*. "Current" is the server-resolved character —
// your pick, or the global default when you never picked.
export default function CharacterSelectPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [summaries, mine] = await Promise.all([
          runEdge(CharacterService.list()),
          runEdge(CharacterService.getForMe()).catch(() => null),
        ])
        const full = await Promise.all(
          summaries.map(async (s) => {
            const data = await runEdge(CharacterService.getById(s.id)).catch(() => null)
            return { id: s.id, name: s.name, manifest: data ? normalizeManifest(data) : null }
          }),
        )
        if (!active) return
        setRows(full.filter((r) => r.manifest))
        setCurrentId(mine?.id ?? null)
      } catch (err: unknown) {
        if (active) setError(`Could not load the characters: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        if (active) setBusy(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  const choose = useCallback(async (id: number) => {
    setBusy(true)
    setError('')
    try {
      await runEdge(CharacterService.select(id))
      setCurrentId(id)
    } catch (err: unknown) {
      setError(`Could not select: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(false)
    }
  }, [])

  return (
    <div className="char-select">
      <div className="char-select-head">
        <h2>Choose your character</h2>
        <Link to="/">← Back to the village</Link>
      </div>
      <p className="char-select-hint">
        Your choice only changes what <em>you</em> look like in the village.
      </p>

      {error && <div className="char-select-error">{error}</div>}
      {!busy && !rows.length && !error && <p>No characters have been saved yet.</p>}

      <div className="char-select-grid">
        {rows.map((r) => (
          <div key={r.id} className={`char-card${r.id === currentId ? ' is-current' : ''}`}>
            <div className="char-card-anim">
              <AnimPreview
                sheet={{ src: resolveSheetSrc(r.manifest) }}
                frames={previewFrames(r.manifest)}
                frameRate={r.manifest.frameRate || 9}
                scale={2}
              />
            </div>
            <div className="char-card-name">{r.name}</div>
            <button
              type="button"
              onClick={() => choose(r.id)}
              disabled={busy || r.id === currentId}
            >
              {r.id === currentId ? 'Your character' : 'Choose'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
