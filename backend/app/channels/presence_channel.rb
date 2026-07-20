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

    @map = map
    @map_id = map.id
    # WebRTC signalling (#279) must address one specific peer, which the
    # per-cell presence streams can't — so alongside them we open a per-user
    # postbox, keyed by the authenticated Keycloak id and scoped to this map so
    # a signal only reaches a target who is actually here.
    stream_from signal_stream(current_user.external_id)
    # No cell until the first `move` says where we stand; the client replays
    # its position on `connected`, so that gap is one round trip.
    @cell = nil
  end

  # Signalling postbox (#279): forward an opaque handshake blob (SDP offer /
  # answer / ICE candidate) to another peer. The server is deliberately dumb —
  # it never parses the payload. It only stamps the sender from the
  # authenticated connection (a client cannot claim to be another peer, mirror
  # of the move-frame discipline) and refuses to relay to anyone who is not a
  # fellow member of this map, so it never becomes a message-passing side
  # channel to arbitrary users on the platform.
  #
  # ponytail: "member of this map" is the access-policy gate, not live
  # presence — an authorised peer who is offline still passes the check, their
  # postbox is simply empty. Tightening to only-currently-connected peers wants
  # a shared presence roster, which this slice deliberately doesn't add.
  def signal(data)
    target = Auth::User.find_by(external_id: data["to"])
    return unless target &&
      @map&.accessible_to?(target, roles: [], groups: [])

    ActionCable.server.broadcast(
      signal_stream(target.external_id),
      { type: "signal", from: current_user.external_id, payload: data["payload"] }
    )
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

  def signal_stream(external_id)
    "signal:map:#{@map_id}:user:#{external_id}"
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
