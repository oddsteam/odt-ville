import { useCallback, useEffect, useState } from 'react'
import { MonstersService } from '../catalog/monsters/service.ts'
import type { MonsterSummary, UpdateMonster } from '../catalog/monsters/schema.ts'
import { runEdge } from '../lib/runEdge.ts'
import { pngHasAlpha } from '../catalog/monsters/pngAlpha.ts'
import './admin.css'

// Soft warning shown when a picked PNG has no alpha channel — it bakes a
// transparency checkerboard into the saved art. Advisory only: saving is still
// allowed (an admin may intend opaque art).
const NO_ALPHA_WARNING =
  'This PNG has no transparency — it may show a checkerboard background. Use a transparent PNG.'

// Recommended uploaded-art dimensions, surfaced as guidance on the file input.
// A square transparent PNG scales cleanly to both the roster thumbnail and a
// future encounter dialog. Kept as a constant so the hint and any later
// validation read the same number.
const RECOMMENDED_IMAGE = '256×256 px transparent PNG'

// Render a server-computed probability fraction ([0, 1]) as a percent. The
// backend already excludes disabled monsters from the denominator, so disabled
// rows arrive as 0 and the enabled rows sum to 100%.
function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

// Read a picked image file into a PNG data URL — the same base64-in-a-text-
// column storage TileObject uses (structure-ready for a later S3/MinIO move,
// which would swap only this read for an upload + key).
function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read that image.'))
    reader.readAsDataURL(file)
  })
}

// Monster admin (issues #56–#58): the weighted wild-encounter pool with each
// monster's computed probability, plus an add/edit form. The same form authors
// a new monster and edits an existing one (pre-filled via the show endpoint).
// The enable/disable toggle lands in #60.
export default function MonstersAdminPage() {
  const [monsters, setMonsters] = useState<readonly MonsterSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Add/edit form state. `editingId` is null when authoring a new monster and
  // the id under edit otherwise; `imageReplaced` tracks whether the admin
  // picked a new file so an unchanged edit keeps (and never resends) the blob.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [image, setImage] = useState<string | null>(null)
  const [imageReplaced, setImageReplaced] = useState(false)
  const [dialog, setDialog] = useState('')
  const [rate, setRate] = useState('0')
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [imageWarning, setImageWarning] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setMonsters(await runEdge(MonstersService.list()))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const pickImage = useCallback(async (file: File | undefined) => {
    if (!file) return
    try {
      setFormError(null)
      const dataUrl = await readImageFile(file)
      setImage(dataUrl)
      setImageReplaced(true)
      setImageWarning(pngHasAlpha(dataUrl) ? null : NO_ALPHA_WARNING)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }, [])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setName('')
    setImage(null)
    setImageReplaced(false)
    setDialog('')
    setRate('0')
    setEnabled(true)
    setFormError(null)
    setImageWarning(null)
  }, [])

  // Pre-fill the form from the full record (the roster summary omits the image,
  // so this fetches the monster to preview its current art).
  const startEdit = useCallback(async (id: number) => {
    setFormError(null)
    setImageWarning(null)
    try {
      const m = await runEdge(MonstersService.get(id))
      setEditingId(m.id)
      setName(m.name)
      setImage(m.image)
      setImageReplaced(false)
      setDialog(m.encounter_dialog ?? '')
      setRate(String(m.encounter_rate))
      setEnabled(m.enabled)
    } catch (e) {
      setFormError((e as Error).message)
    }
  }, [])

  // Delete a monster, guarded by a confirm so a stray click can't drop it. The
  // pool shrinks server-side, so re-fetch the roster to pick up the recomputed
  // %s; if we were editing the deleted monster, abandon the edit.
  const removeMonster = useCallback(
    async (m: MonsterSummary) => {
      if (!window.confirm(`Delete "${m.name}"? This can't be undone.`)) return
      setBusy(true)
      setFormError(null)
      try {
        await runEdge(MonstersService.del(m.id))
        if (editingId === m.id) resetForm()
        await load()
      } catch (err) {
        setFormError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [editingId, resetForm, load],
  )

  // Flip a monster's enabled flag via the shared update endpoint — an
  // enabled-only PATCH, which the controller's conditional assignment applies
  // without touching the other fields. Disabling drops it from the probability
  // denominator, so re-fetch the roster to show the recomputed %s.
  const toggleEnabled = useCallback(
    async (m: MonsterSummary) => {
      setBusy(true)
      setFormError(null)
      try {
        await runEdge(MonstersService.update(m.id, { enabled: !m.enabled }))
        await load()
      } catch (err) {
        setFormError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [load],
  )

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = name.trim()
      if (!trimmed) {
        setFormError('Give the monster a name.')
        return
      }

      setBusy(true)
      setFormError(null)
      try {
        if (editingId === null) {
          if (!image) {
            setFormError('Upload an image for the monster.')
            return
          }
          await runEdge(
            MonstersService.create({
              name: trimmed,
              image,
              encounter_dialog: dialog,
              encounter_rate: Number(rate) || 0,
              enabled,
            }),
          )
        } else {
          // Send the image only when the admin actually replaced it, so leaving
          // it unchanged keeps the stored blob server-side.
          const body: UpdateMonster = {
            name: trimmed,
            encounter_dialog: dialog,
            encounter_rate: Number(rate) || 0,
            enabled,
            ...(imageReplaced && image ? { image } : {}),
          }
          await runEdge(MonstersService.update(editingId, body))
        }
        resetForm()
        await load()
      } catch (err) {
        setFormError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [name, image, imageReplaced, dialog, rate, enabled, editingId, resetForm, load],
  )

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!monsters) return <p className="admin-msg">Loading monsters…</p>

  const editing = editingId !== null

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">Monsters</h2>

      <form className="admin-form" onSubmit={submit}>
        <h3 className="admin-form-title">{editing ? 'Edit monster' : 'Add a monster'}</h3>

        <label className="admin-field">
          <span className="admin-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>

        <label className="admin-field">
          <span className="admin-label">Image</span>
          <input
            type="file"
            accept="image/png"
            disabled={busy}
            onChange={(e) => pickImage(e.target.files?.[0])}
          />
          <span className="admin-hint">
            Recommended: {RECOMMENDED_IMAGE}
            {editing && ' — leave empty to keep the current image'}
          </span>
          {imageWarning && <span className="admin-msg admin-msg-warn">{imageWarning}</span>}
          {image && <img className="admin-preview" src={image} alt="monster preview" />}
        </label>

        <label className="admin-field">
          <span className="admin-label">Encounter dialog</span>
          <textarea
            value={dialog}
            onChange={(e) => setDialog(e.target.value)}
            disabled={busy}
            placeholder="Shown when the avatar encounters this monster"
          />
        </label>

        <label className="admin-field">
          <span className="admin-label">Encounter rate</span>
          <input
            type="number"
            min={0}
            step={1}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            disabled={busy}
          />
          <span className="admin-hint">
            Higher = encountered more often, relative to the whole pool.
          </span>
        </label>

        <label className="admin-field admin-field-inline">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={busy}
          />
          <span className="admin-label">Enabled</span>
        </label>

        {formError && <p className="admin-msg admin-msg-error">{formError}</p>}

        <div className="admin-actions">
          <button type="submit" className="save" disabled={busy}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add monster'}
          </button>
          {editing && (
            <button type="button" onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {monsters.length === 0 ? (
        <p className="admin-msg">No monsters yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Encounter rate</th>
              <th>Probability</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {monsters.map((m) => (
              <tr key={m.id} className={m.enabled ? undefined : 'admin-row-off'}>
                <td>{m.name}</td>
                <td>{m.encounter_rate}</td>
                <td>{percent(m.probability)}</td>
                <td>
                  <button type="button" onClick={() => toggleEnabled(m)} disabled={busy}>
                    {m.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" onClick={() => startEdit(m.id)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-delete"
                    onClick={() => removeMonster(m)}
                    disabled={busy}
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
