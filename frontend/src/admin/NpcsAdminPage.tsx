import { useCallback, useEffect, useState } from 'react'
import { NpcsService } from '../catalog/npcs/service.ts'
import { NpcsWrite } from '../catalog/npcs/write.ts'
import type { Npc, UpdateNpc } from '../catalog/npcs/schema.ts'
import { CharacterService } from '../character/service.ts'
import type { ManifestSummary } from '../character/schema.ts'
import { normalizeManifest, resolveSheetSrc, POSTURE_KEYS } from '../kernel/characterManifest.js'
import AnimPreview from '../spriteMapper/AnimPreview.tsx'
import { runEdge } from '../lib/runEdge.ts'
import './admin.css'

// The rig posture to show in the picker. A walking Down loop reads best (it is
// how the NPC will appear approaching the player); fall back to idle Down, then
// to whatever posture has frames at all. Same choice CharacterRoster makes.
function previewFrames(m: any) {
  if (m.postures?.walkDown?.length) return m.postures.walkDown
  if (m.postures?.idleDown?.length) return m.postures.idleDown
  for (const k of POSTURE_KEYS) if (m.postures?.[k]?.length) return m.postures[k]
  return []
}

// NPC admin (#260): CRUD for the catalog of placed characters, so the decorate
// editor's trainer picker has something to offer. Named for identity, not role
// (#259) — the same row can serve a duelling trainer, a shopkeeper or a
// wanderer, so this page says "NPCs" and never "Trainers".
//
// Art is *picked*, not uploaded: an NPC points at a rig authored in the sprite
// mapper. That is the second of the mapper's two tracks — a user picks a rig
// for their own character (ADR-0009), an admin picks one for an NPC — and it is
// what lets an NPC walk, which a still image never could.
export default function NpcsAdminPage() {
  const [npcs, setNpcs] = useState<readonly Npc[] | null>(null)
  const [rigs, setRigs] = useState<readonly ManifestSummary[]>([])
  const [error, setError] = useState<string | null>(null)

  // Add/edit form state. `editingId` is null when authoring a new NPC and the
  // id under edit otherwise.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [rigId, setRigId] = useState('')
  const [level, setLevel] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // The picked rig's full manifest, fetched on demand so the roster stays the
  // light blob-free index. Only the selected rig is fetched, never all of them.
  const [preview, setPreview] = useState<any | null>(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [npcList, rigList] = await Promise.all([
        runEdge(NpcsService.list()),
        runEdge(CharacterService.list()),
      ])
      setNpcs(npcList)
      setRigs(rigList)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Load the picked rig's frames for the preview. A failed fetch just leaves
  // the preview blank — it is guidance, not a gate on saving.
  useEffect(() => {
    if (!rigId) {
      setPreview(null)
      return
    }
    let live = true
    runEdge(CharacterService.getById(Number(rigId)))
      .then((data) => live && setPreview(normalizeManifest(data)))
      .catch(() => live && setPreview(null))
    return () => {
      live = false
    }
  }, [rigId])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setName('')
    setRigId('')
    setLevel('')
    setEnabled(true)
    setFormError(null)
  }, [])

  // A blank level field means "this NPC never duels" — null, not 0.
  const levelValue = () => (level.trim() === '' ? null : Number(level))
  const rigValue = () => (rigId === '' ? null : Number(rigId))

  const startEdit = useCallback((npc: Npc) => {
    setFormError(null)
    setEditingId(npc.id)
    setName(npc.name)
    setRigId(npc.character_manifest_id === null ? '' : String(npc.character_manifest_id))
    setLevel(npc.level === null ? '' : String(npc.level))
    setEnabled(npc.enabled)
  }, [])

  // Delete an NPC, guarded by a confirm so a stray click can't drop it. A
  // trainer Zone still naming it simply stops resolving; if we were editing the
  // deleted NPC, abandon the edit.
  const removeNpc = useCallback(
    async (npc: Npc) => {
      if (!window.confirm(`Delete "${npc.name}"? This can't be undone.`)) return
      setBusy(true)
      setFormError(null)
      try {
        await runEdge(NpcsWrite.del(npc.id))
        if (editingId === npc.id) resetForm()
        await load()
      } catch (err) {
        setFormError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [editingId, resetForm, load],
  )

  // Flip an NPC's enabled flag via the shared update endpoint — an enabled-only
  // PATCH, which the controller's conditional assignment applies without
  // touching the other fields.
  const toggleEnabled = useCallback(
    async (npc: Npc) => {
      setBusy(true)
      setFormError(null)
      try {
        await runEdge(NpcsWrite.update(npc.id, { enabled: !npc.enabled }))
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
        setFormError('Give the NPC a name.')
        return
      }

      setBusy(true)
      setFormError(null)
      try {
        const body = {
          name: trimmed,
          character_manifest_id: rigValue(),
          level: levelValue(),
          enabled,
        }
        if (editingId === null) {
          await runEdge(NpcsWrite.create(body))
        } else {
          await runEdge(NpcsWrite.update(editingId, body as UpdateNpc))
        }
        resetForm()
        await load()
      } catch (err) {
        setFormError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [name, rigId, level, enabled, editingId, resetForm, load],
  )

  if (error) return <p className="admin-msg admin-msg-error">{error}</p>
  if (!npcs) return <p className="admin-msg">Loading NPCs…</p>

  const editing = editingId !== null
  const rigName = (id: number | null) =>
    id === null ? '—' : (rigs.find((r) => r.id === id)?.name ?? `#${id} (deleted)`)

  return (
    <div className="admin-page">
      <h2 className="admin-page-title">NPCs</h2>

      <form className="admin-form" onSubmit={submit}>
        <h3 className="admin-form-title">{editing ? 'Edit NPC' : 'Add an NPC'}</h3>

        <label className="admin-field">
          <span className="admin-label">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </label>

        <label className="admin-field">
          <span className="admin-label">Sprite</span>
          <select value={rigId} onChange={(e) => setRigId(e.target.value)} disabled={busy}>
            <option value="">(no sprite yet)</option>
            {rigs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.active ? ' — default character' : ''}
              </option>
            ))}
          </select>
          <span className="admin-hint">
            Mapped in the <a href="/admin/sprites">sprite mapper</a>. An NPC uses the same rigs
            players pick from, which is what lets it walk.
          </span>
          {preview && (
            <AnimPreview
              sheet={{ src: resolveSheetSrc(preview) }}
              frames={previewFrames(preview)}
              frameRate={preview.frameRate ?? 9}
            />
          )}
        </label>

        <label className="admin-field">
          <span className="admin-label">Level</span>
          <input
            type="number"
            min={1}
            step={1}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={busy}
          />
          <span className="admin-hint">
            Shown by the duel screen. Leave blank for an NPC who never duels.
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
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add NPC'}
          </button>
          {editing && (
            <button type="button" onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {npcs.length === 0 ? (
        <p className="admin-msg">No NPCs yet — the trainer picker has nothing to offer.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Sprite</th>
              <th>Level</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {npcs.map((npc) => (
              <tr key={npc.id} className={npc.enabled ? undefined : 'admin-row-off'}>
                <td>{npc.name}</td>
                <td>{rigName(npc.character_manifest_id)}</td>
                <td>{npc.level ?? '—'}</td>
                <td>
                  <button type="button" onClick={() => toggleEnabled(npc)} disabled={busy}>
                    {npc.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button type="button" onClick={() => startEdit(npc)} disabled={busy}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="admin-delete"
                    onClick={() => removeNpc(npc)}
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
