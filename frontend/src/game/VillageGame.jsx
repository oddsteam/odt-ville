import { useMemo } from 'react'
import { buildTown } from './constants.js'
import VillageMap from './VillageMap.jsx'

// The Village Game black box. Receives community list + game session as
// props; emits door-entry and admin events. Has no API knowledge, no routing,
// and no imports outside this directory. Drop-in usable from any shell.
//
// Inputs:
//   communities       — array of community objects (id, title, color,
//                       logo_url, category_key, position_order, badges)
//   session           — { spawn: { area, last_community_id } } from /game/session
//   dailyBrief        — a React node rendered into the game's top-right
//                       overlay slot. The shell decides what to render here
//                       (e.g. a daily-brief modal trigger).
//
// Outputs:
//   onEnterCommunity(id)  — player walked onto a community doorway
//
// Sort communities by position_order and drop each onto the next plot of the
// town the game generates. The town size adapts to community count.
function buildBuildings(communities, town) {
  return [...communities]
    .sort((a, b) => a.position_order - b.position_order)
    .map((community, i) => ({ community, ...town.plots[i] }))
}

// Resolve the avatar's spawn point from session:
//   - returning visitor whose last community still exists → on its doormat
//   - first-time visitor or stale reference → Town Entrance
function resolveSpawn(town, buildings, session) {
  const id = session?.spawn?.last_community_id
  const b = id != null ? buildings.find((x) => x.community.id === id) : null
  return b
    ? { x: b.doorCol, y: b.doorRow + 1, facing: 'up' }
    : { x: town.entrance.x, y: town.entrance.y, facing: 'up' }
}

export default function VillageGame({
  communities,
  session,
  dailyBrief,
  onEnterCommunity,
  trainerDefeated,
  onTrainerDefeated,
}) {
  const town = useMemo(
    () => buildTown(Math.max(communities.length, 1)),
    [communities],
  )
  const buildings = useMemo(
    () => buildBuildings(communities, town),
    [communities, town],
  )
  const townSpawn = useMemo(
    () => resolveSpawn(town, buildings, session),
    [town, buildings, session],
  )

  return (
    <VillageMap
      town={town}
      buildings={buildings}
      townSpawn={townSpawn}
      dailyBrief={dailyBrief}
      onEnterCommunity={onEnterCommunity}
      trainerDefeated={trainerDefeated}
      onTrainerDefeated={onTrainerDefeated}
    />
  )
}
