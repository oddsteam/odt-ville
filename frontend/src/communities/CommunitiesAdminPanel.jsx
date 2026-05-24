import { useState } from 'react'
import { categoryEmoji } from './constants.js'
import { createCommunity, removeCommunity } from './client.js'

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

// Community CRUD console — lives outside the village game so the game can stay
// a true black box. Owns its own API calls and asks the shell to refetch via
// `onChanged()` after each mutation so the village/feed reflect the new state.
export default function CommunitiesAdminPanel({ communities, onChanged }) {
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
      await createCommunity({
        title: title.trim(),
        category_key: category,
        color: colour,
        logo_url: logoUrl.trim(),
      })
      setTitle('')
      setLogoUrl('')
      if (onChanged) await onChanged()
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
      await removeCommunity(id)
      if (onChanged) await onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="admin-page" aria-label="Manage communities">
      <header className="admin-page-header">
        <h2>⚙ COMMUNITIES</h2>
        <p className="admin-count">
          {used} {used === 1 ? 'community' : 'communities'} in the village
        </p>
      </header>

      <div className="admin-page-body">
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
    </section>
  )
}
