// Village-game session client — the only place the game-session API lives.
// Kept isolated from the communities client so non-game UIs never need it.
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

// GET /game/session -> { last_area, last_community_id, last_room, spawn }
export function getGameSession() {
  return request('/game/session')
}

// PUT /game/session
export function saveGameSession({ last_area, last_community_id, last_room }) {
  return request('/game/session', {
    method: 'PUT',
    headers: jsonHeaders,
    body: JSON.stringify({ last_area, last_community_id, last_room }),
  })
}
