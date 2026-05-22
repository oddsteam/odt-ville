// All backend communication lives here. Base path is reached via the Vite proxy.
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
    throw new Error(`Request to ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  // Some endpoints may return empty bodies; guard the JSON parse.
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const jsonHeaders = { 'Content-Type': 'application/json' }

export function getVillage() {
  return request('/village')
}

export function getHouse(id) {
  return request(`/houses/${id}`)
}

// Admin: add a community (creates the house + its three boards).
export function createHouse(attrs) {
  return request('/houses', {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(attrs),
  })
}

// Admin: remove a community.
export function deleteHouse(id) {
  return request(`/houses/${id}`, { method: 'DELETE' })
}

export function openItem(id) {
  return request(`/content_items/${id}/open`, {
    method: 'POST',
    headers: jsonHeaders,
  })
}

export function acknowledgeItem(id) {
  return request(`/content_items/${id}/acknowledge`, {
    method: 'POST',
    headers: jsonHeaders,
  })
}

export function saveLocation({ last_area, last_house_id, last_room }) {
  return request('/me/location', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ last_area, last_house_id, last_room }),
  })
}
