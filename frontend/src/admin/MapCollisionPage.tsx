import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { MapsService } from '../maps/service.ts'
import type { BakedMap } from '../maps/schema.ts'
import { makeMask, setMaskCell, resizeMask, isMaskEmpty, type Mask } from './maskPaint.ts'
import MapPreview from './MapPreview.tsx'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Standalone collision editor (#131 follow-up): paint a *saved* map's collision
// mask, decoupled from create/import. Loads the baked map by slug, paints on a
// grid the same size over the WYSIWYG preview, and PATCHes the mask back
// (MapsService.updateCollision). An all-clear mask clears it server-side.
export default function MapCollisionPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const [baked, setBaked] = useState<BakedMap | null>(null)
  const [collision, setCollision] = useState<Mask>(() => makeMask(0, 0))
  const [tool, setTool] = useState<'paint' | 'erase'>('paint')
  const [showMask, setShowMask] = useState(true)
  const painting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // Load the map and seed the grid from its existing mask (resizeMask fills any
  // missing cells false, so an unmasked map starts all-clear at the right size).
  useEffect(() => {
    if (!slug) return
    let live = true
    runEdge(MapsService.get(slug))
      .then((m) => {
        if (!live) return
        setBaked(m)
        setCollision(resizeMask(m.collision ?? [], m.cols, m.rows))
      })
      .catch((e) => live && setError((e as Error).message))
    return () => {
      live = false
    }
  }, [slug])

  // Release the drag if the mouse comes up off the grid.
  useEffect(() => {
    const end = () => (painting.current = false)
    window.addEventListener('mouseup', end)
    return () => window.removeEventListener('mouseup', end)
  }, [])

  const paint = (x: number, y: number) =>
    setCollision((m) => setMaskCell(m, x, y, tool === 'paint'))

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await runEdge(MapsService.updateCollision(slug, isMaskEmpty(collision) ? null : collision))
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (error && !baked) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!baked) return <p className="admin-msg">Loading map…</p>

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Collision — {baked.title}</h1>
      <p>
        <Link to="/admin/maps">← Back to maps</Link>
      </p>

      <div className="admin-field-inline" style={{ marginBottom: 4 }}>
        <button onClick={() => setTool('paint')} disabled={tool === 'paint'}>
          Paint
        </button>
        <button onClick={() => setTool('erase')} disabled={tool === 'erase'}>
          Erase
        </button>
        <button onClick={() => setShowMask((s) => !s)}>
          {showMask ? 'Hide overlay' : 'Show overlay'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <p className="admin-hint">Collision mask</p>
          <div
            style={{ display: 'grid', gridTemplateColumns: `repeat(${baked.cols}, 22px)` }}
            onMouseLeave={() => (painting.current = false)}
          >
            {Array.from({ length: baked.rows }, (_, y) =>
              Array.from({ length: baked.cols }, (_, x) => {
                const blocked = !!collision[y]?.[x]
                return (
                  <div
                    key={`c${x},${y}`}
                    role="button"
                    aria-label={`collision ${x},${y}`}
                    aria-pressed={blocked}
                    onMouseDown={() => {
                      painting.current = true
                      paint(x, y)
                    }}
                    onMouseEnter={() => {
                      if (painting.current) paint(x, y)
                    }}
                    onMouseUp={() => (painting.current = false)}
                    style={{
                      width: 22,
                      height: 22,
                      background: showMask && blocked ? '#dd3333' : '#3a3a3a',
                      border: '1px solid #0004',
                      boxSizing: 'border-box',
                    }}
                  />
                )
              }),
            )}
          </div>
        </div>
        <div>
          <p className="admin-hint">Preview (baked)</p>
          <MapPreview baked={baked} />
        </div>
      </div>

      <button onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save collision'}
      </button>
      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {saved && <p className="admin-msg">Saved.</p>}
    </div>
  )
}
