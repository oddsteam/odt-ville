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

  # Card badges (#317): one stream for everybody, deliberately unpartitioned.
  # Eira's ingest knows an email — not a map, not a cell — so it cannot address
  # the interest-managed streams, and a card change is a few frames a day per
  # person against a movement frame every step. Clients drop a card for anyone
  # outside their roster, so the fanout costs nothing visible.
  CARD_STREAM = "cards"

  # Standees, live (#375): one stream per map, deliberately unpartitioned like
  # the card stream above. A deploy is a handful of frames a day against a
  # movement frame every step, so map-wide fanout costs nothing — and a Standee
  # raised across the plaza should go up for everyone standing on it, not only
  # for whoever happens to share the deployer's cell. The writer is the REST
  # controller, which is why this is public: the broadcast is a consequence of
  # a durable write, never the mechanism of it.
  def self.standee_stream(map_id)
    "standees:map:#{map_id}"
  end

  def subscribed
    map = ::Maps::Map.find_by(slug: params[:slug])
    # The room join rides the same gate as list/load (#83) — and a solo map
    # (the generated hometown has no row at all) never opens a room.
    return reject unless map&.multiplayer? &&
      map.accessible_to?(current_user, roles: current_roles, groups: current_groups)

    @map_id = map.id
    # WebRTC signalling (#279) must address one specific peer, which the
    # per-cell presence streams can't — so alongside them we open a per-user
    # postbox, keyed by the authenticated Keycloak id and scoped to this map so
    # a signal only reaches a target who is actually here.
    stream_from signal_stream(current_user.external_id)
    stream_from CARD_STREAM
    stream_from self.class.standee_stream(@map_id)
    # World entry (#318): one bulk read of Eira's board before any frame moves,
    # so a card someone picked up while we were down is already on their avatar
    # when the first move frame stamps it. Not polling — the card stream keeps
    # it live from here. Inline rather than in a job: it must land before this
    # connection's first move, and it degrades to a no-op if Eira is down.
    ::Cards::Seed.run
    # No cell until the first `move` says where we stand; the client replays
    # its position on `connected`, so that gap is one round trip.
    @cell = nil
  end

  # Signalling postbox (#279): forward an opaque handshake blob (SDP offer /
  # answer / ICE candidate) to another peer. The server is deliberately dumb —
  # it never parses the payload, and stamps the sender from the authenticated
  # connection so a client cannot claim to be another peer (mirror of the
  # move-frame discipline).
  #
  # There is deliberately no per-target access check. It would be unsound: a
  # `claim`-gated map keys on the target's Keycloak roles/groups, which live in
  # *their* JWT, not our DB — so the server cannot authorise another user, and
  # the earlier `roles: []` attempt silently refused every peer on a claim map.
  # And it would be redundant: the postbox is map-scoped and per-user, and a
  # connection only streams `signal:map:<id>:user:<own-id>` after clearing this
  # map's join gate (`subscribed`). Delivery is therefore already confined to
  # authorised, present members. The join gate is the single enforcement point;
  # a second check here only gave it a chance to drift and break.
  def signal(data)
    to = data["to"]
    return unless to.is_a?(String) && to.present?

    ActionCable.server.broadcast(
      signal_stream(to),
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
  # Their current card (#317) rides it too: a peer who walks into range after
  # the card landed missed the live frame, and this is the frame that spawns
  # them.
  def broadcast(frame)
    return unless @cell

    ActionCable.server.broadcast(
      stream_name(*@cell),
      frame.merge(
        userId: current_user.external_id,
        name: current_user.name,
        manifestId: current_user.effective_character_manifest&.id,
        card: Cards::Registry.for(current_user.external_id)
      )
    )
  end
end
