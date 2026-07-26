import { useState } from 'react'

// The header's face (#320). `src` is our own proxy path (ADR-0012) — never
// Basecamp's URL — or null when the person has no avatar at all.
//
// A stale stored URL 404s on the proxy between syncs, so the image failing is a
// normal state, not an error: it drops back to the same initials chip a null
// gets. Remount on a user swap (key by external_id) to clear that.
export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
  return letters || '🙂'
}

export default function Avatar({ src, name }: { src: string | null; name: string }) {
  const [broken, setBroken] = useState(false)

  return (
    <span className="app-avatar" aria-hidden="true">
      {src && !broken ? (
        <img className="app-avatar-img" src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        initials(name)
      )}
    </span>
  )
}
