import { useState } from 'react'
import { categoryEmoji } from './constants.js'

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

// Admin tool — add or delete communities. Per the PRD, this panel raises
// `onCreate(attrs)` and `onDelete(id)` events; the shell is responsible for
// calling the communities client and refetching. The panel only owns its
// local form state and the in-flight `busy` flag.
export default function AdminPanel({ communities, onClose, onCreate, onDelete }) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('community')
  const [colour, setColour] = useState('#16A085')
  const [logoUrl, setLogoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const used = communities.length

  async function handleAdd(e) {
    e.preventDefault()
    if (busy || !title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        title: title.trim(),
        category_key: category,
        color: colour,
        logo_url: logoUrl.trim(),
      })
      setTitle('')
      setLogoUrl('')
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
      await onDelete(id)
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
            {used} {used === 1 ? 'community' : 'communities'} in the village
          </p>

          <ul className="admin-list">
            {communities.map((c) => (
              <li key={c.id} className="admin-row">
                <span className="admin-swatch" style={{ background: c.color }} />
                <span className="admin-emoji">{categoryEmoji(c.category_key)}</span>
                <span className="admin-row-name">{c.title}</span>
                <button
                  type="button"
                  className="admin-del"
                  onClick={() => handleDelete(c.id)}
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
