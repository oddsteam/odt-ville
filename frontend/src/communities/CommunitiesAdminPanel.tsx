import { useEffect, useState } from 'react'
import { categoryEmoji } from './constants.js'
import { CommunitiesService } from './service.ts'
import type { Community } from './schema.ts'
import { PostureService } from '../posture/service.ts'
import type { PostureSet } from '../posture/schema.ts'
import { MapsService, type MapSummary } from '../maps/service.ts'
import { TileObjectsService } from '../catalog/tileObjects/service.ts'
import type { TileObjectSummary } from '../catalog/tileObjects/schema.ts'
import { EmployeesService } from '../org/service.ts'
import { runEdge } from '../lib/runEdge.ts'
import '../lib/mapperChrome.css'
import './admin.css'

const CATEGORIES = [
  { key: 'compliance', label: 'Compliance' },
  { key: 'product', label: 'Product' },
  { key: 'branch_ops', label: 'Branch Ops' },
  { key: 'learning', label: 'Learning' },
  { key: 'community', label: 'Community' },
]

const COLOURS = [
  '#C0392B', '#2E86C1', '#1E8449', '#8E44AD',
  '#E67E22', '#16A085', '#D4AC0D', '#CB4335',
]

const POSTURE_GATE = 'posture-login'

// Rename in place: the house's name is an input that saves on blur or Enter.
// Escape or a blank name puts the stored title back — a house with no name
// can't be found on the map, and the server rejects it anyway.
function CommunityName({
  house,
  onSaved,
}: {
  house: Community
  onSaved?: () => void | Promise<void>
}) {
  const [name, setName] = useState(house.title)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const title = name.trim()
    if (busy || title === house.title) return
    if (!title) {
      setName(house.title)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await runEdge(CommunitiesService.update(house.id, { title }))
      if (onSaved) await onSaved()
    } catch (err) {
      setError((err as Error).message)
      setName(house.title)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <input
        className="comm-name"
        aria-label={`Name for ${house.title}`}
        value={name}
        maxLength={40}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') setName(house.title)
        }}
      />
      {error && <span className="comm-gate-err">{error}</span>}
    </>
  )
}

// Per-house door-Portal editor (ADR-0005): the interior Node the door travels
// to (#113), its gate — "No gate" or "Posture-login + <set>" (#38) — and the
// plot's mapped building (#292, "None (default)" = active object / bundled
// art). The posture set comes from the live catalog; the current set isn't
// shown because posture_set_id is server-only (never in the index), so editing
// a gated house re-picks the set.
function HouseDoor({
  house,
  sets,
  nodes,
  buildings,
  sites,
  onSaved,
}: {
  house: Community
  sets: readonly PostureSet[]
  nodes: readonly MapSummary[]
  buildings: readonly TileObjectSummary[]
  sites: readonly string[]
  onSaved?: () => void | Promise<void>
}) {
  const [gate, setGate] = useState(house.entry_gate === POSTURE_GATE ? POSTURE_GATE : '')
  const [setId, setSetId] = useState('')
  const [nodeSlug, setNodeSlug] = useState(house.interior_node_slug ?? '')
  // The plot's assigned mapped building (#292); '' = none, fall back to the
  // active object / bundled art.
  const [buildingId, setBuildingId] = useState(
    house.tile_object_id != null ? String(house.tile_object_id) : '',
  )
  // The building's Site scope (#503); '' = downtown (all Staff), a name scopes
  // it to users placed at that Site.
  const [site, setSite] = useState(house.site ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (busy) return
    if (gate === POSTURE_GATE && !setId) {
      setError('Pick a posture set')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await runEdge(
        CommunitiesService.update(house.id, {
          entry_gate: gate || null,
          posture_set_id: gate === POSTURE_GATE ? setId : null,
          interior_node_slug: nodeSlug || null,
          tile_object_id: buildingId ? Number(buildingId) : null,
          site: site || null,
        }),
      )
      if (onSaved) await onSaved()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="comm-gate">
      <select
        aria-label={`Interior node for ${house.title}`}
        value={nodeSlug}
        onChange={(e) => setNodeSlug(e.target.value)}
        disabled={busy}
      >
        <option value="">Default interior</option>
        {nodes.map((n) => (
          <option key={n.slug} value={n.slug}>
            {n.title || n.slug}
          </option>
        ))}
      </select>

      <select
        aria-label={`Building for ${house.title}`}
        value={buildingId}
        onChange={(e) => setBuildingId(e.target.value)}
        disabled={busy}
      >
        <option value="">None (default)</option>
        {buildings.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name} ({b.footprint_w}×{b.footprint_h})
          </option>
        ))}
      </select>

      <select
        aria-label={`Site scope for ${house.title}`}
        value={site}
        onChange={(e) => setSite(e.target.value)}
        disabled={busy}
      >
        <option value="">Downtown (all staff)</option>
        {sites.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        aria-label={`Entry gate for ${house.title}`}
        value={gate}
        onChange={(e) => setGate(e.target.value)}
        disabled={busy}
      >
        <option value="">No gate</option>
        <option value={POSTURE_GATE}>Posture-login</option>
      </select>

      {gate === POSTURE_GATE && (
        <select
          aria-label={`Posture set for ${house.title}`}
          value={setId}
          onChange={(e) => setSetId(e.target.value)}
          disabled={busy}
        >
          <option value="">Choose a posture set…</option>
          {sets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      <button type="button" className="comm-gate-save" onClick={save} disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error && <span className="comm-gate-err">{error}</span>}
    </div>
  )
}

// Community CRUD console — lives outside the village game so the game can stay
// a true black box. Owns its own API calls and asks the shell to refetch via
// `onChanged()` after each mutation so the village/feed reflect the new state.
export default function CommunitiesAdminPanel({
  communities,
  onChanged,
}: {
  communities: readonly Community[]
  onChanged?: () => void | Promise<void>
}) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('community')
  const [colour, setColour] = useState('#16A085')
  const [logoUrl, setLogoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sets, setSets] = useState<readonly PostureSet[]>([])
  const [nodes, setNodes] = useState<readonly MapSummary[]>([])
  const [buildings, setBuildings] = useState<readonly TileObjectSummary[]>([])
  const [sites, setSites] = useState<readonly string[]>([])

  // The posture-set catalog for the gate picker. Empty if posture-login is
  // unreachable — the picker just shows no sets and a gate can't be saved.
  useEffect(() => {
    runEdge(PostureService.listSets())
      .then(setSets)
      .catch(() => setSets([]))
  }, [])

  // The authored maps for the interior-node picker (#113). Empty on error —
  // the picker offers only "Default interior".
  useEffect(() => {
    runEdge(MapsService.list())
      .then(setNodes)
      .catch(() => setNodes([]))
  }, [])

  // The saved 'building' objects for the per-community building picker (#292).
  // Empty on error — the picker offers only "None (default)".
  useEffect(() => {
    runEdge(TileObjectsService.list('building'))
      .then(setBuildings)
      .catch(() => setBuildings([]))
  }, [])

  // The Site names for the scope picker (#503). Empty on error — the picker
  // then offers only "Downtown (all staff)".
  useEffect(() => {
    runEdge(EmployeesService.listSites())
      .then(setSites)
      .catch(() => setSites([]))
  }, [])

  const used = communities.length

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await runEdge(
        CommunitiesService.create({
          title: title.trim(),
          category_key: category,
          color: colour,
          logo_url: logoUrl.trim(),
        }),
      )
      setTitle('')
      setLogoUrl('')
      if (onChanged) await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: number) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await runEdge(CommunitiesService.remove(id))
      if (onChanged) await onChanged()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tilemapper" aria-label="Manage communities">
      <header className="bar">
        <h1>Communities</h1>
        <span className="comm-count">
          {used} {used === 1 ? 'community' : 'communities'} in the village
        </span>
      </header>

      {error && <div className="status">{error}</div>}

      <div className="cols">
        <div className="left comm-left">
          <h3 className="comm-h">In the village ({used})</h3>
          <ul className="comm-list">
            {communities.map((c) => (
              <li key={c.id} className="comm-row">
                <div className="comm-row-main">
                  <span className="comm-swatch" style={{ background: c.color }} />
                  <span className="comm-emoji">{categoryEmoji(c.category_key)}</span>
                  <CommunityName house={c} onSaved={onChanged} />
                  <button
                    type="button"
                    className="comm-del"
                    title="Delete community"
                    onClick={() => handleDelete(c.id)}
                    disabled={busy}
                  >
                    ×
                  </button>
                </div>
                <HouseDoor house={c} sets={sets} nodes={nodes} buildings={buildings} sites={sites} onSaved={onChanged} />
              </li>
            ))}
            {used === 0 && <li className="hint">No communities yet.</li>}
          </ul>
        </div>

        <div className="right">
          <h3>New community</h3>
          <form className="comm-form" onSubmit={handleAdd}>
            <label>
              Name
              <input
                type="text"
                value={title}
                maxLength={40}
                placeholder="e.g. Finance House"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="comm-field">
              <span className="comm-field-label">Roof colour</span>
              <div className="comm-colours">
                {COLOURS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`comm-colour${colour === c ? ' on' : ''}`}
                    style={{ background: c }}
                    aria-label={`colour ${c}`}
                    onClick={() => setColour(c)}
                  />
                ))}
              </div>
            </div>

            <label>
              Logo URL (optional)
              <input
                type="text"
                value={logoUrl}
                placeholder="https://…"
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </label>

            <button
              type="submit"
              className="save"
              disabled={busy || !title.trim()}
            >
              {busy ? 'Working…' : 'Add community'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
