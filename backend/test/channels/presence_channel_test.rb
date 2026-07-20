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

  test "subscribing to an accessible multiplayer map streams its presence room" do
    map = make_map

    join(map)

    assert subscription.confirmed?
    assert_has_stream "presence:map:#{map.id}"
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

    frame = { type: "move", userId: @user.external_id, name: @user.name, x: 3, y: 4, facing: "down" }
    assert_broadcast_on("presence:map:#{map.id}", frame) do
      perform :move, x: 3, y: 4, facing: "down", userId: "spoofed-id"
    end
  end

  test "unsubscribing broadcasts a leave frame" do
    map = make_map
    join(map)

    assert_broadcast_on("presence:map:#{map.id}", type: "leave", userId: @user.external_id, name: @user.name) do
      unsubscribe
    end
  end
end
