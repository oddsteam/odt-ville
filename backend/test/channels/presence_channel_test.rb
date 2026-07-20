require "test_helper"

# Presence multiplayer (#88): per-map position broadcasting. Identity is
# stamped server-side from the authenticated connection, the room join is
# gated by the map's access policy (#83), and solo maps never open a room.
class PresenceChannelTest < ActionCable::Channel::TestCase
  include ApiTestHelpers

  setup do
    @company, @user = setup_company
  end

  # Minimal playable authored map (same fixture shape as the maps request
  # spec), multiplayer-flagged unless the test says otherwise.
  def make_map(multiplayer: true, policy: { "kind" => "public" })
    ::Maps::Map.create!(
      slug: "plaza",
      title: "The Plaza",
      access_policy: policy,
      multiplayer: multiplayer,
      cols: 1,
      rows: 1,
      baked: {
        "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
        "tiles" => [[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 0 }]]
      }
    )
  end

  def join(map)
    stub_connection current_user: @user, current_roles: [], current_groups: []
    subscribe slug: map.slug
  end

  def cell_stream(map, cx, cy)
    "presence:map:#{map.id}:cell:#{cx}:#{cy}"
  end

  # Interest management (#158): the neighbourhood is only knowable once the
  # player announces a tile, so the join itself attaches nothing. The client
  # replays its position on `connected`, which closes that window.
  test "subscribing to an accessible multiplayer map confirms but streams no cell yet" do
    map = make_map

    join(map)

    assert subscription.confirmed?
    assert_no_streams
  end

  test "a move attaches the sender's cell and its eight neighbours" do
    map = make_map
    join(map)

    perform :move, x: 3, y: 4, facing: "down"

    (-1..1).each do |cx|
      (-1..1).each { |cy| assert_has_stream cell_stream(map, cx, cy) }
    end
  end

  test "crossing a cell boundary drops the cells left behind and attaches the new ones" do
    map = make_map
    join(map)

    perform :move, x: 3, y: 4, facing: "right"   # cell 0,0
    perform :move, x: 15, y: 4, facing: "right"  # cell 1,0

    assert_has_stream cell_stream(map, 2, 1)
    assert_has_no_stream cell_stream(map, -1, 0)
  end

  # The scaling property, stated structurally rather than as a load test: a
  # player broadcasts on their own cell only, so a distant one's frames land on
  # a stream we never attached. Inbound rate therefore tracks local density,
  # not the map's population.
  test "a distant player's cell is not among our streams" do
    map = make_map
    join(map)

    perform :move, x: 3, y: 4, facing: "down"

    assert_has_no_stream cell_stream(map, 5, 5)
  end

  test "a solo map opens no presence room" do
    join(make_map(multiplayer: false))

    assert subscription.rejected?
  end

  test "the room join is gated by the map access policy" do
    join(make_map(policy: { "kind" => "members" }))

    assert subscription.rejected?
  end

  test "an unknown slug is rejected" do
    stub_connection current_user: @user, current_roles: [], current_groups: []
    subscribe slug: "nowhere"

    assert subscription.rejected?
  end

  test "move broadcasts a frame stamped with the connection's Keycloak id, ignoring a client-sent one" do
    map = make_map
    join(map)

    assert_broadcast_on(cell_stream(map, 0, 0), manifest_frame(nil)) do
      perform :move, x: 3, y: 4, facing: "down", userId: "spoofed-id"
    end
  end

  # Peers render each other's real character (#266): the frame carries the
  # sender's effective manifest id, resolved server-side exactly like for_me.
  test "move stamps the sender's picked manifest id" do
    picked = ::Character::CharacterManifest.create!(name: "scout", data: {})
    ::Character::CharacterManifest.create!(name: "global", data: {}, active: true)
    @user.update!(character_manifest: picked)
    map = make_map
    join(map)

    assert_broadcast_on(cell_stream(map, 0, 0), manifest_frame(picked.id)) do
      perform :move, x: 3, y: 4, facing: "down"
    end
  end

  test "a user with no pick falls back to the global active manifest" do
    global = ::Character::CharacterManifest.create!(name: "global", data: {}, active: true)
    map = make_map
    join(map)

    assert_broadcast_on(cell_stream(map, 0, 0), manifest_frame(global.id)) do
      perform :move, x: 3, y: 4, facing: "down"
    end
  end

  test "no pick and no active manifest stamps nil" do
    map = make_map
    join(map)

    assert_broadcast_on(cell_stream(map, 0, 0), manifest_frame(nil)) do
      perform :move, x: 3, y: 4, facing: "down"
    end
  end

  def manifest_frame(manifest_id)
    {
      type: "move", userId: @user.external_id, name: @user.name,
      x: 3, y: 4, facing: "down", manifestId: manifest_id
    }
  end

  # The leave rides the cell the player was last seen in — exactly the peers
  # who could see them are subscribed to it.
  test "unsubscribing broadcasts a leave frame on the last cell" do
    map = make_map
    join(map)
    perform :move, x: 3, y: 4, facing: "down"

    leave = { type: "leave", userId: @user.external_id, name: @user.name, manifestId: nil }
    assert_broadcast_on(cell_stream(map, 0, 0), leave) do
      unsubscribe
    end
  end
end
