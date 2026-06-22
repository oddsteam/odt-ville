// Village-game session client — the only place the game-session API lives.
// Kept isolated from the communities client so non-game UIs never need it.
//
// The resource (get + save) lives in `service.ts` as a typed Effect service
// with an effect/Schema decoder. The helpers below are thin Promise façades
// over that service for the existing JSX call site (VillagePage), keeping the
// same signatures so callers stay plain async/await.

import { runEdge } from '../lib/runEdge.ts'
import { GameSessionService } from './service.ts'

// GET /game/session -> { last_area, last_community_id, last_room, spawn }
export function getGameSession() {
  return runEdge(GameSessionService.get())
}

// PUT /game/session
/**
 * @param {{ last_area?: string, last_community_id?: number | null, last_room?: string | null }} body
 */
export function saveGameSession({ last_area, last_community_id, last_room }) {
  return runEdge(GameSessionService.save({ last_area, last_community_id, last_room }))
}
