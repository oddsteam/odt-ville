import { useState } from 'react'
import { categoryEmoji } from './constants.js'
import { createCommunity, removeCommunity } from './client.js'
import '../tileMapper/styles.css'
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
                <span className="comm-swatch" style={{ background: c.color }} />
                <span className="comm-emoji">{categoryEmoji(c.category_key)}</span>
                <span className="comm-name">{c.title}</span>
                <button
                  type="button"
                  className="comm-del"
                  title="Delete community"
                  onClick={() => handleDelete(c.id)}
                  disabled={busy}
                >
                  ×
                </button>
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
