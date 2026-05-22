import { useState } from 'react'
import { PRIORITY_RANK, BOARD_LABELS } from '../constants.js'
import { openItem, acknowledgeItem } from '../api.js'
import { formatDate, formatExpiry } from '../format.js'
import PriorityChip from './PriorityChip.jsx'
import StateBadge from './StateBadge.jsx'

// A single brief row — ContentCard-like but flattened for the list modal.
function BriefRow({ item, onItemUpdate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isOpened = item.state === 'opened' || item.state === 'acknowledged'
  const isAcknowledged = item.state === 'acknowledged'
  const needsAck = item.requires_ack && !isAcknowledged

  async function run(fn) {
    setBusy(true)
    setError(null)
    try {
      const res = await fn(item.id)
      onItemUpdate(res)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`brief-row${isOpened ? ' brief-row-opened' : ''}`}>
      <header className="brief-row-head">
        <h4 className="brief-row-title">{item.title}</h4>
        <div className="content-card-badges">
          <PriorityChip priority={item.priority} />
          <StateBadge state={item.state} />
        </div>
      </header>

      <p className="brief-row-source">
        {item.house_title}
        {item.board_type ? ` · ${BOARD_LABELS[item.board_type] || item.board_type}` : ''}
      </p>

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
          <button type="button" onClick={() => run(openItem)} disabled={busy}>
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
            onClick={() => run(acknowledgeItem)}
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

// A "Daily Brief" button + modal. The fallback so the game layer never
// blocks content access. After closing, the parent refetches the village.
export default function DailyBriefShortcut({ items, onClose }) {
  const [open, setOpen] = useState(false)
  // Local copy so open/acknowledge render immediately within the modal.
  const [briefItems, setBriefItems] = useState(items || [])

  // Keep local list in sync if the village data changes underneath us.
  function openModal() {
    setBriefItems(items || [])
    setOpen(true)
  }

  function closeModal() {
    setOpen(false)
    if (onClose) onClose()
  }

  function handleItemUpdate(res) {
    setBriefItems((prev) =>
      prev.map((it) => (it.id === res.id ? { ...it, ...res } : it)),
    )
  }

  // Group urgent first, then important, then normal; stable within groups.
  const sorted = [...briefItems].sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99),
  )

  return (
    <>
      <button type="button" className="daily-brief-btn" onClick={openModal}>
        📋 Daily Brief
      </button>

      {open && (
        <div
          className="modal-overlay"
          onClick={closeModal}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Daily Brief"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2>📋 Daily Brief</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ✕
              </button>
            </header>
            <div className="modal-body">
              {sorted.length === 0 ? (
                <p className="board-empty">No brief items today.</p>
              ) : (
                sorted.map((item) => (
                  <BriefRow
                    key={item.id}
                    item={item}
                    onItemUpdate={handleItemUpdate}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
