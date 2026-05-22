import { useState } from 'react'
import { createHouse, deleteHouse } from '../api.js'
import { categoryEmoji, N_PLOTS } from '../constants.js'

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

// Admin tool: add or delete communities. Each community is a house — adding
// one drops a new building onto the next free town plot.
export default function AdminPanel({ houses, onClose, onChanged }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('community')
  const [colour, setColour] = useState('#16A085')
  const [logoUrl, setLogoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const used = houses.length
  const full = used >= N_PLOTS

  async function handleAdd(e) {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createHouse({
        title: title.trim(),
        category_key: category,
        color: colour,
        logo_url: logoUrl.trim(),
      })
      setTitle('')
      setLogoUrl('')
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteHouse(id)
      await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal admin-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage communities"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>⚙ COMMUNITIES</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="admin-count">
            {used} of {N_PLOTS} town plots used
          </p>

          <ul className="admin-list">
            {houses.map((h) => (
              <li key={h.id} className="admin-row">
                <span className="admin-swatch" style={{ background: h.color }} />
                <span className="admin-emoji">{categoryEmoji(h.category_key)}</span>
                <span className="admin-row-name">{h.title}</span>
                <button
                  type="button"
                  className="admin-del"
                  onClick={() => handleDelete(h.id)}
                  disabled={busy}
                >
                  DELETE
                </button>
              </li>
            ))}
          </ul>

          <form className="admin-form" onSubmit={handleAdd}>
            <h3 className="admin-form-title">+ NEW COMMUNITY</h3>

            <label className="admin-field">
              <span>Name</span>
              <input
                type="text"
                value={title}
                maxLength={40}
                placeholder="e.g. Finance House"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <label className="admin-field">
              <span>Category</span>
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

            <div className="admin-field">
              <span>Roof colour</span>
              <div className="admin-colours">
                {COLOURS.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`admin-colour${colour === c ? ' admin-colour-on' : ''}`}
                    style={{ background: c }}
                    aria-label={`colour ${c}`}
                    onClick={() => setColour(c)}
                  />
                ))}
              </div>
            </div>

            <label className="admin-field">
              <span>Logo URL (optional)</span>
              <input
                type="text"
                value={logoUrl}
                placeholder="https://…"
                onChange={(e) => setLogoUrl(e.target.value)}
              />
            </label>

            {error && <p className="admin-error">{error}</p>}
            {full && (
              <p className="admin-warn">
                All plots are full — a new community is created but only gets a
                building once one is deleted.
              </p>
            )}

            <button
              type="submit"
              className="admin-add"
              disabled={busy || !title.trim()}
            >
              {busy ? 'WORKING…' : 'ADD COMMUNITY'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
