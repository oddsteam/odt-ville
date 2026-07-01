import { useState } from 'react'
import { MapsService, mapCreateBody } from '../maps/service.ts'
import type { SourceMap } from '../maps/baker.ts'
import { MEADOW_CATALOG } from '../maps/fixtures/meadow.ts'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// Map editor S2 (#106): the thinnest slice that proves the whole editor -> bake
// -> write-API -> runtime loop before any painting UI. The terrain is a fixed
// 8x6 grass grid; the author only sets slug + title, clicks Save, and the map
// is baked (ADR-0003) and POSTed to /api/v1/maps (#105), then deep-linked to
// /maps/<slug> where the unchanged runtime renders it. Painting lands in #107.
//
// ADR-0004 import boundary: this editor imports only the shared kernel (baker,
// catalog) and the maps data service — never the Game Runtime (MapScene/Phaser).
const COLS = 8
const ROWS = 6

// A fixed all-grass source; baking it yields one grass fill per cell.
const grassTerrain = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => 'grass'))

export default function MapEditorPage() {
  const [slug, setSlug] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSlug, setSavedSlug] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    setSavedSlug(null)
    const source: SourceMap = { slug, title, cols: COLS, rows: ROWS, terrain: grassTerrain }
    try {
      const map = await runEdge(MapsService.create(mapCreateBody(source, MEADOW_CATALOG)))
      setSavedSlug(map.slug)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">New Map</h1>
      <p className="admin-hint">A fixed {COLS}×{ROWS} grass map — set a slug and title, then save.</p>

      <label className="admin-field">
        Slug
        <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="the-atrium" />
      </label>
      <label className="admin-field">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Atrium" />
      </label>

      <button onClick={save} disabled={busy || !slug || !title}>
        {busy ? 'Saving…' : 'Save'}
      </button>

      {error && <p className="admin-msg admin-msg-error">{error}</p>}
      {savedSlug && (
        <p className="admin-msg">
          Saved. <a href={`/maps/${savedSlug}`}>Open /maps/{savedSlug}</a>
        </p>
      )}
    </div>
  )
}
