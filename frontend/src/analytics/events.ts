// Game analytics events (issue #102). The Phaser black box only emits
// callbacks (onEnterCommunity / onOpenBoard); the building name is resolved
// here from the community list the shell already holds, so no PostHog code
// leaks into the game/ scenes. Every event also carries `email` (#101).

import type { Community } from '../communities/schema.ts'
import { captureEvent } from './posthog.ts'

// Resolve a community's display title (the "building" name) from the loaded
// list by id. Undefined when the id is unknown/null so we never invent a name.
export function buildingName(
  communities: readonly Community[] | null,
  id: number | null,
): string | undefined {
  if (id == null) return undefined
  return communities?.find((c) => c.id === id)?.title
}

// Player walked through a door — one event per entry, tagged with the building.
export function trackEnterDoor(
  communities: readonly Community[] | null,
  id: number,
): void {
  captureEvent('enter_door', { building: buildingName(communities, id) })
}

// Player interacted with any interior board — one event per interaction. The
// board type rides along as extra context; the building name is the point.
export function trackInteractBoard(
  communities: readonly Community[] | null,
  activeCommunityId: number | null,
  boardType?: string,
): void {
  captureEvent('interact_board', {
    building: buildingName(communities, activeCommunityId),
    board_type: boardType,
  })
}
