# Presence multiplayer (#88), interest-managed (#158): a multiplayer map is
# partitioned into CELL-square cells, each its own stream. A client streams the
# cell it stands in plus the 8 around it — a 36x36-tile window, comfortably
# wider than the camera, so peers are already synced a tile before they come
# into view. Broadcasts go to the sender's own cell only: everyone who can see
# them is subscribed to it, so per-client frame rate is bounded by local
# density rather than by the map's total population.
class PresenceChannel < ApplicationCable::Channel
  # 12 tiles: three of them span 36, against a ~24x19-tile camera at 48px.
  CELL = 12

  def subscribed
    map = ::Maps::Map.find_by(slug: params[:slug])
    # The room join rides the same gate as list/load (#83) — and a solo map
    # (the generated hometown has no row at all) never opens a room.
    return reject unless map&.multiplayer? &&
      map.accessible_to?(current_user, roles: current_roles, groups: current_groups)

    @map_id = map.id
    # No cell until the first `move` says where we stand; the client replays
    # its position on `connected`, so that gap is one round trip.
    @cell = nil
  end

  def move(data)
    resubscribe(cell_of(data["x"], data["y"]))
    broadcast(type: "move", x: data["x"], y: data["y"], facing: data["facing"])
  end

  def unsubscribed
    broadcast(type: "leave")
  end

  private

  def cell_of(x, y)
    [ (x.to_i / CELL.to_f).floor, (y.to_i / CELL.to_f).floor ]
  end

  def stream_name(cx, cy)
    "presence:map:#{@map_id}:cell:#{cx}:#{cy}"
  end

  # Swap the 3x3 neighbourhood on a cell crossing, touching only the
  # difference — a step that stays inside the cell costs nothing.
  def resubscribe(cell)
    return if cell == @cell

    was = neighbourhood(@cell)
    @cell = cell
    now = neighbourhood(cell)
    (was - now).each { |name| stop_stream_from(name) }
    (now - was).each { |name| stream_from(name) }
  end

  # ponytail: cells off the map edge are streamed too rather than clamped —
  # an empty stream costs nothing and the bounds check would earn its keep
  # only if map dimensions ever became a hot path here.
  def neighbourhood(cell)
    return [] unless cell

    cx, cy = cell
    (cx - 1..cx + 1).flat_map { |x| (cy - 1..cy + 1).map { |y| stream_name(x, y) } }
  end

  # Identity is stamped from the authenticated connection — the stable
  # Keycloak sub, never a socket id, and never a client-sent field — so
  # frames can't be spoofed and proximity voice (#159) can key on it later. The
  # sender's effective manifest id (#266) rides the same stamp so peers can
  # render their real character; nil means "fall back to the bundled stills".
  def broadcast(frame)
    return unless @cell

    ActionCable.server.broadcast(
      stream_name(*@cell),
      frame.merge(
        userId: current_user.external_id,
        name: current_user.name,
        manifestId: current_user.effective_character_manifest&.id
      )
    )
  end
end
