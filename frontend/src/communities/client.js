// Communities + content data client. No game / spatial concepts here — this
// module is the reusable boundary on the frontend, mirroring /api/v1/communities
// and the content_items endpoints.
const BASE = '/api/v1'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      detail = ''
    }
    throw new Error(
      `Request to ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`,
    )
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const jsonHeaders = { 'Content-Type': 'application/json' }

// GET /communities -> { communities: [...] }
export function listCommunities() {
  return request('/communities').then((d) => d.communities)
}

// GET /communities/:id -> { community, boards }
export function getCommunity(id) {
  return request(`/communities/${id}`)
}

// POST /communities { title, color, logo_url, category_key }
export function createCommunity(attrs) {
  return request('/communities', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(attrs),
  })
}

// DELETE /communities/:id
export function removeCommunity(id) {
  return request(`/communities/${id}`, { method: 'DELETE' })
}

// GET /content_items/feed -> { items: [...] }
export function getFeed() {
  return request('/content_items/feed').then((d) => d.items)
}

// POST /content_items/:id/open
export function openItem(id) {
  return request(`/content_items/${id}/open`, {
    method: 'POST',
    headers: jsonHeaders,
  })
}

// POST /content_items/:id/acknowledge
export function acknowledgeItem(id) {
  return request(`/content_items/${id}/acknowledge`, {
    method: 'POST',
    headers: jsonHeaders,
  })
}
