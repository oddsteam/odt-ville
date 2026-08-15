import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

// AnimPreview is presentation-only (canvas playback of frame rects), reused from
// the sprite mapper (#399) — the large preview is it, unchanged, pointed at a
// baked Look. Authoring may be imported by the shell-side picker, never the
// reverse, so no arch edge is crossed.
import AnimPreview from '../spriteMapper/AnimPreview.tsx'
import { CharacterService } from './service.ts'
import { runEdge } from '../lib/runEdge.ts'
import { buildLookData, orderedParts, selectionFromParts, toggleAccessory, type LookSelection } from './look.ts'
import { groupParts, partStyle, SLOTS, type Catalog, type Slot } from './parts.ts'
import { bakeLook } from './bakeLook.ts'
import type { ManifestSummary } from './schema.ts'

const PACK = 'modern-interiors'
const PACK_DIR = `/maps/characters/packs/${PACK}/`
const LAYOUT_URL = `${PACK_DIR}layout.json`
const PARTS_URL = `${PACK_DIR}parts.json`

type FrameRect = { x: number; y: number; w: number; h: number }
// The pack layout is loose (same convention as the rest of the manifest code):
// atlas dims for baking, postures for the frame rects AnimPreview plays.
type Layout = { name: string; frameRate?: number; atlas: { width: number; height: number }; postures: Record<string, FrameRect[]> }

const EMPTY: LookSelection = { body: '', eyes: '', outfit: '', hairstyle: '', accessory: [] }

// A 422 from the cap/slot rules renders `{ error }` — surface it verbatim.
function serverMessage(err: unknown, fallback: string) {
  const body = (err as { body?: string })?.body
  if (body) {
    try {
      return JSON.parse(body).error ?? fallback
    } catch {
      /* not JSON */
    }
  }
  return err instanceof Error ? err.message : fallback
}

// Bake `parts` into a sheet and play `frames` — a composited Look drawn by the
// shared AnimPreview. One frame → static (thumbnails), many → animated (the big
// preview). Re-bakes only when the part list changes (`key`).
function Baked({ parts, layout, frames, frameRate, scale }: { parts: string[]; layout: Layout; frames: FrameRect[]; frameRate: number; scale: number }) {
  const [src, setSrc] = useState('')
  const key = parts.join('|')
  useEffect(() => {
    let alive = true
    bakeLook(parts, layout).then((s) => alive && setSrc(s))
    return () => {
      alive = false
    }
    // key stands in for `parts`; layout is stable once loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, layout])
  return <AnimPreview sheet={src ? { src } : null} frames={frames} frameRate={frameRate} scale={scale} />
}

// The real Look builder (#399): a two-tier picker per Part slot (style grid,
// then colour row) with live composited thumbnails, over the #398 save/wear
// plumbing. Every thumbnail is the user's current Look with one Part swapped in.
export default function LookBuilderPage() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [selection, setSelection] = useState<LookSelection>(EMPTY)
  const [activeSlot, setActiveSlot] = useState<Slot>('body')
  const [openStyle, setOpenStyle] = useState<Partial<Record<Slot, string>>>({})
  const [mine, setMine] = useState<readonly ManifestSummary[]>([])
  const [wornId, setWornId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [looks, worn] = await Promise.all([
      runEdge(CharacterService.listMine()),
      runEdge(CharacterService.getForMe()).catch(() => null),
    ])
    setMine(looks)
    setWornId(worn?.id ?? null)
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const [lay, names, worn] = await Promise.all([
          fetch(LAYOUT_URL).then((r) => r.json() as Promise<Layout>),
          fetch(PARTS_URL).then((r) => r.json() as Promise<string[]>),
          runEdge(CharacterService.getForMe()).catch(() => null),
        ])
        const cat = groupParts(names)
        // Seed from the worn Look's parts; a premade sheet has none, so fall back
        // to the first body/eyes so the preview is a character, not a mannequin.
        const seeded = selectionFromParts((worn?.data as { parts?: string[] } | undefined)?.parts ?? [])
        setSelection({
          ...seeded,
          body: seeded.body || cat.body[0]?.parts[0] || '',
          eyes: seeded.eyes || cat.eyes[0]?.parts[0] || '',
        })
        setCatalog(cat)
        setLayout(lay)
        await refresh()
      } catch (e) {
        setError(serverMessage(e, 'Could not load the part pack.'))
      }
    })()
  }, [refresh])

  const setSingle = useCallback((slot: Exclude<Slot, 'accessory'>, name: string) => {
    setSelection((s) => ({ ...s, [slot]: name }))
  }, [])

  const save = useCallback(async () => {
    if (!layout) return
    setBusy(true)
    setError('')
    try {
      const saved = await runEdge(CharacterService.saveLook(buildLookData(selection, layout)))
      await runEdge(CharacterService.select(saved.id))
      await refresh()
    } catch (e) {
      setError(serverMessage(e, 'Could not save the Look.'))
    } finally {
      setBusy(false)
    }
  }, [selection, layout, refresh])

  // Update the worn Look in place (#424) — same id, so the worn pointer and
  // peers keep pointing at it; no re-select needed.
  const saveChanges = useCallback(async () => {
    if (!layout || wornId == null) return
    setBusy(true)
    setError('')
    try {
      await runEdge(CharacterService.updateLook(wornId, buildLookData(selection, layout)))
      await refresh()
    } catch (e) {
      setError(serverMessage(e, 'Could not save the changes.'))
    } finally {
      setBusy(false)
    }
  }, [selection, layout, wornId, refresh])

  const act = useCallback(
    async (run: Promise<unknown>, fail: string) => {
      setBusy(true)
      setError('')
      try {
        await run
        await refresh()
      } catch (e) {
        setError(serverMessage(e, fail))
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  // Wearing a saved Look loads it into the builder, so the preview and picker
  // snap to what's now worn instead of keeping the in-progress edit. A premade
  // sheet has no parts to load — leave the builder untouched in that case.
  const wear = useCallback(
    async (id: number) => {
      setBusy(true)
      setError('')
      try {
        await runEdge(CharacterService.select(id))
        const data = await runEdge(CharacterService.getById(id))
        const parts = (data as { parts?: string[] }).parts ?? []
        if (parts.length) {
          setSelection(selectionFromParts(parts))
          setOpenStyle({})
        }
        await refresh()
      } catch (e) {
        setError(serverMessage(e, 'Could not wear it.'))
      } finally {
        setBusy(false)
      }
    },
    [refresh],
  )

  if (error && !catalog) return <Shell><div className="char-select-error">{error}</div></Shell>
  if (!catalog || !layout) return <Shell><p>Loading the part pack…</p></Shell>

  const idle = layout.postures.idleDown ?? []
  const walk = layout.postures.walkDown ?? idle
  const frameRate = layout.frameRate || 9
  const styles = catalog[activeSlot]
  const multiStyle = styles.length > 1
  const slotMeta = SLOTS.find((s) => s.key === activeSlot)!
  const currentName = activeSlot === 'accessory' ? '' : (selection[activeSlot] as string)
  const openKey = openStyle[activeSlot] ?? (currentName ? partStyle(currentName) : styles[0]?.style)
  const openGroup = styles.find((g) => g.style === openKey) ?? styles[0]

  // The parts a thumbnail shows: current Look with one candidate swapped into its
  // slot (an accessory previews solo, so its shape reads clearly on the body).
  const previewParts = (name: string) =>
    activeSlot === 'accessory' ? orderedParts({ ...selection, accessory: [name] }) : orderedParts({ ...selection, [activeSlot]: name })

  const isVariantOn = (name: string) => (activeSlot === 'accessory' ? selection.accessory.includes(name) : name === currentName)
  const isStyleOn = (style: string) => (activeSlot === 'accessory' ? selection.accessory.some((n) => partStyle(n) === style) : partStyle(currentName) === style)

  const pickStyle = (style: string) => {
    setOpenStyle((o) => ({ ...o, [activeSlot]: style }))
    if (activeSlot !== 'accessory') setSingle(activeSlot, styles.find((g) => g.style === style)!.parts[0])
  }
  const pickVariant = (name: string) => {
    if (activeSlot === 'accessory') setSelection((s) => ({ ...s, accessory: toggleAccessory(s.accessory, name) }))
    else setSingle(activeSlot, name)
  }
  const clearSlot = () => {
    setOpenStyle((o) => ({ ...o, [activeSlot]: undefined }))
    if (activeSlot === 'accessory') setSelection((s) => ({ ...s, accessory: [] }))
    else if (activeSlot === 'outfit' || activeSlot === 'hairstyle') setSingle(activeSlot, '')
  }

  const canSave = Boolean(selection.body && selection.eyes) && !busy
  // "Save changes" only applies to a worn Look the caller owns (in `mine`); a
  // worn premade / house Look can't be updated (it 404s), so create-only.
  const canSaveChanges = canSave && mine.some((m) => m.id === wornId)

  return (
    <Shell>
      {error && <div className="char-select-error">{error}</div>}

      <div className="builder">
        <div className="builder-stage">
          <div className="builder-preview">
            <Baked parts={orderedParts(selection)} layout={layout} frames={walk} frameRate={frameRate} scale={4} />
          </div>
          <div className="builder-saves">
            <button type="button" className="builder-save" onClick={saveChanges} disabled={!canSaveChanges}>
              Save changes
            </button>
            <button type="button" className="builder-save" onClick={save} disabled={!canSave}>
              Save as new
            </button>
          </div>

          <h3>Your Looks ({mine.length}/3)</h3>
          {!mine.length && <p>No Looks yet.</p>}
          <ul className="look-list">
            {mine.map((m) => (
              <li key={m.id}>
                <span>{m.name}{m.id === wornId ? ' — worn' : ''}</span>
                <button type="button" disabled={busy || m.id === wornId} onClick={() => wear(m.id)}>
                  Wear
                </button>
                <button type="button" disabled={busy} onClick={() => act(runEdge(CharacterService.deleteLook(m.id)), 'Could not delete it.')}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="builder-picker">
          <div className="builder-tabs">
            {SLOTS.map((s) => (
              <button key={s.key} type="button" className={s.key === activeSlot ? 'is-active' : ''} onClick={() => setActiveSlot(s.key)}>
                {s.label}
              </button>
            ))}
          </div>

          {multiStyle && (
            <div className="builder-grid" role="listbox" aria-label={`${slotMeta.label} styles`}>
              {!slotMeta.required && (
                <button type="button" className="builder-tile builder-none" onClick={clearSlot}>
                  None
                </button>
              )}
              {styles.map((g) => (
                <button
                  key={g.style}
                  type="button"
                  className={`builder-tile${isStyleOn(g.style) ? ' is-on' : ''}${g.style === openKey ? ' is-open' : ''}`}
                  onClick={() => pickStyle(g.style)}
                >
                  <Baked parts={previewParts(styleThumb(g, currentName, activeSlot))} layout={layout} frames={idle} frameRate={1} scale={2} />
                </button>
              ))}
            </div>
          )}

          {openGroup && (
            <div className="builder-variants" role="listbox" aria-label={`${slotMeta.label} colours`}>
              {openGroup.parts.map((name) => (
                <button key={name} type="button" className={`builder-tile${isVariantOn(name) ? ' is-on' : ''}`} onClick={() => pickVariant(name)}>
                  <Baked parts={previewParts(name)} layout={layout} frames={idle} frameRate={1} scale={2} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

// A style tile shows that style on the current body — the worn colour if this
// style is the one worn, else the style's first colour.
function styleThumb(g: { style: string; parts: string[] }, currentName: string, slot: Slot) {
  if (slot !== 'accessory' && partStyle(currentName) === g.style) return currentName
  return g.parts[0]
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="char-select char-builder">
      <div className="char-select-head">
        <h2>Build your own</h2>
        <Link to="/character">← Characters</Link>
        <Link to="/">← Back to the village</Link>
      </div>
      <p className="char-select-hint">Pick a style, then a colour. Every thumbnail is your Look with that part swapped in. Save to wear it — you can keep three.</p>
      {children}
    </div>
  )
}
