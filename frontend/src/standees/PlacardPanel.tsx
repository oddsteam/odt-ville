import { useEffect } from 'react'
import Avatar from '../viewer/Avatar.tsx'
import { attribution, shortLine, type Placard } from './placard.ts'

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
}: {
  placard: Placard
  onClose: () => void
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
      </div>
    </div>
  )
}
