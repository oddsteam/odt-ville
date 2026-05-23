# Builds the GET /api/v1/game/session payload. The session captures the
# user's coarse last location (area + last community visited) and a derived
# `spawn` the village game uses to decide where to drop the avatar.
#
# The DB column is still `last_house_id` (the schema rename is deliberately
# out of scope for the API split); the wire format exposes it as
# `last_community_id` to match the new boundary.
module GameSessionSerializer
  module_function

  def call(user:)
    loc = user.location_state
    last_community_id = resolve_last_community_id(user, loc)
    {
      last_area: loc.last_area,
      last_community_id: last_community_id,
      last_room: loc.last_room,
      spawn: { area: "town", last_community_id: last_community_id }
    }
  end

  # A returning user only spawns at their last community if it is still
  # active in this company; otherwise the spawn falls back to the entrance.
  def resolve_last_community_id(user, loc)
    last_id = loc.last_house_id
    return nil unless last_id

    user.company.houses.active.exists?(id: last_id) ? last_id : nil
  end
end
