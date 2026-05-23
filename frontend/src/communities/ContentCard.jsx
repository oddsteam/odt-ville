import { useState } from 'react'
import { openItem, acknowledgeItem } from './client.js'
import { formatDate, formatExpiry } from './format.js'
import PriorityChip from './PriorityChip.jsx'
import StateBadge from './StateBadge.jsx'

// One content item. Calm, ordinary content UI (the map is the playful part).
// `item` is the content_item object. `onItemUpdate(updatedFields)` lets the
// parent merge the API response back into its state.
export default function ContentCard({ item, onItemUpdate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isOpened = item.state === 'opened' || item.state === 'acknowledged'
  const isAcknowledged = item.state === 'acknowledged'
  const needsAck = item.requires_ack && !isAcknowledged

  async function handleOpen() {
    setBusy(true)
    setError(null)
    try {
      const res = await openItem(item.id)
      onItemUpdate(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleAcknowledge() {
    setBusy(true)
    setError(null)
    try {
      const res = await acknowledgeItem(item.id)
      onItemUpdate(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`content-card${isOpened ? ' content-card-opened' : ''}`}>
      <header className="content-card-head">
        <h4 className="content-card-title">{item.title}</h4>
        <div className="content-card-badges">
          <PriorityChip priority={item.priority} />
          <StateBadge state={item.state} />
        </div>
      </header>

      {item.summary && <p className="content-card-summary">{item.summary}</p>}

      <dl className="content-card-meta">
        <div className="meta-pair">
          <dt>Effective</dt>
          <dd>{formatDate(item.effective_from) || '—'}</dd>
        </div>
        <div className="meta-pair">
          <dt>Expires</dt>
          <dd>{formatExpiry(item.expires_at)}</dd>
        </div>
        {item.requires_ack && (
          <div className="meta-pair">
            <dt>Acknowledgement</dt>
            <dd className={isAcknowledged ? 'ack-done' : 'ack-required'}>
              {isAcknowledged ? 'Acknowledged' : 'Required'}
            </dd>
          </div>
        )}
      </dl>

      {isOpened && item.body && (
        <div className="content-card-body">
          <p>{item.body}</p>
        </div>
      )}

      {error && <p className="content-card-error">{error}</p>}

      <footer className="content-card-actions">
        {!isOpened && (
          <button type="button" onClick={handleOpen} disabled={busy}>
            {busy ? 'Opening…' : 'Open'}
          </button>
        )}
        {isOpened && !item.requires_ack && (
          <span className="content-card-done">Opened</span>
        )}
        {needsAck && (
          <button
            type="button"
            className="btn-ack"
            onClick={handleAcknowledge}
            disabled={busy}
          >
            {busy ? 'Acknowledging…' : 'Acknowledge'}
          </button>
        )}
        {isAcknowledged && (
          <span className="content-card-done">Acknowledged ✓</span>
        )}
      </footer>
    </article>
  )
}
