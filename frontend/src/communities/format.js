// Small presentation helpers shared across content components.

// Format an ISO date string into a short readable date.
export function formatDate(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// "no expiry" fallback for nullable expires_at.
export function formatExpiry(iso) {
  return iso ? formatDate(iso) : 'no expiry'
}
