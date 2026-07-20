# Presence multiplayer (#88): one broadcast room per multiplayer-flagged map.
# Clients announce their own position (a `move` per tile-step); the server's
# only jobs are the access gate and stamping identity. Map-wide fanout is the
# blessed MVP — interest-managed cells replace it in #158.
class PresenceChannel < ApplicationCable::Channel
  def subscribed
    map = ::Maps::Map.find_by(slug: params[:slug])
    # The room join rides the same gate as list/load (#83) — and a solo map
    # (the generated hometown has no row at all) never opens a room.
    return reject unless map&.multiplayer? &&
      map.accessible_to?(current_user, roles: current_roles, groups: current_groups)

    @stream = "presence:map:#{map.id}"
    stream_from @stream
  end

  def move(data)
    broadcast(type: "move", x: data["x"], y: data["y"], facing: data["facing"])
  end

  def unsubscribed
    broadcast(type: "leave") if @stream
  end

  private

  # Identity is stamped from the authenticated connection — the stable
  # Keycloak sub, never a socket id, and never a client-sent field — so
  # frames can't be spoofed and proximity voice can key on it later.
  def broadcast(frame)
    ActionCable.server.broadcast(
      @stream,
      frame.merge(userId: current_user.external_id, name: current_user.name)
    )
  end
end
