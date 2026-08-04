import { useEffect } from 'react'
import Avatar from '../viewer/Avatar.tsx'
import { attribution, expiryNote, replyHref, shortLine, type Placard } from './placard.ts'

// The full Placard, opened by pressing A on a Standee (#372, ADR-0015). The
// game detects the press and emits the note over a semantic seam; the *shell*
// mounts this — the same discipline as `onEnterCommunity`, so no panel and no
// detail rendering lives inside the game black box. It is a full-bleed takeover
// in the encounter's visual language, but it is not an encounter (that means
// battle), so the shell renders it rather than EncounterScene.
//
// Owner name and face head it, then the short line the person wrote, then the
// detail body they left. A dangling owner (no name/face) still attributes and
// still shows the note — the Placard says its piece regardless.
export default function PlacardPanel({
  placard,
  onClose,
  onPickUp,
}: {
  placard: Placard
  onClose: () => void
  // Present only where the shell owns the pickup write (#370). On your own
  // cutout it offers *pick up* where a visitor is offered *reply* — the same
  // press-A, a different affordance by who is asking. Absent (e.g. a read-only
  // surface) simply shows no pickup button.
  onPickUp?: () => void
}) {
  // Escape closes, like any modal takeover; the game resumes on close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const name = placard.ownerName ?? ''
  // The reply link becomes a button only when it is a real http(s) address
  // (#373) — a missing, malformed or non-web link simply has none, and the
  // Placard still says its piece. Opens in a new tab, like the board shortcut.
  // Suppressed on your own cutout (#370): there the affordance is pick up, not
  // reply — you don't reply to your own announcement.
  const reply = !placard.mine && placard.replyLink ? replyHref(placard.replyLink) : null

  return (
    <div className="placard-scrim" onClick={onClose}>
      <div
        className="placard-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Standee"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="placard-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="placard-owner">
          <Avatar src={placard.ownerAvatarUrl} name={name} />
          <p className="placard-attribution">{attribution(name)}</p>
        </div>
        <p className="placard-line">{shortLine(placard.message)}</p>
        {placard.detail && <p className="placard-detail">{placard.detail}</p>}
        {/* When the cutout goes (#374). The note says "Sunday"; this says which
            Sunday — a Standee is time-bound, and the reader has to know by
            when. */}
        <p className="placard-expiry">{expiryNote(placard.expiresAt)}</p>
        {reply && (
          <a
            className="placard-reply"
            href={reply}
            target="_blank"
            rel="noopener noreferrer"
          >
            Reply where they’re planning it →
          </a>
        )}
        {placard.mine && onPickUp && (
          <button type="button" className="placard-pickup" onClick={onPickUp}>
            Pick up
          </button>
        )}
      </div>
    </div>
  )
}
