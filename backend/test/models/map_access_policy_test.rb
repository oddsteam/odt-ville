require "test_helper"

# Map access policy (#83): the server-side gate deciding who may list/load —
# and later multiplayer-join — a map. `public` admits any authenticated user,
# `claim` admits a matching Keycloak role or group, `members` admits users
# with a MapMembership row.
class MapAccessPolicyTest < ActiveSupport::TestCase
  setup do
    @company = Org::Company.create!(name: "Co")
    @user = @company.users.create!(name: "U", external_id: SecureRandom.uuid)
  end

  def make_map(policy = nil)
    attrs = { slug: "atrium", title: "The Atrium", cols: 1, rows: 1 }
    attrs[:access_policy] = policy if policy
    Maps::Map.create!(attrs)
  end

  test "a map defaults to a public policy" do
    assert_equal "public", make_map.access_policy.kind
  end

  test "a public map is accessible to any user" do
    assert make_map.accessible_to?(@user, roles: [], groups: [])
  end

  test "a role-claim map admits only users with the matching role" do
    map = make_map({ "kind" => "claim", "role" => "staff" })

    assert map.accessible_to?(@user, roles: ["staff"], groups: [])
    assert_not map.accessible_to?(@user, roles: ["other"], groups: [])
  end

  test "a group-claim map admits only users in the matching group" do
    map = make_map({ "kind" => "claim", "group" => "/hq" })

    assert map.accessible_to?(@user, roles: [], groups: ["/hq"])
    assert_not map.accessible_to?(@user, roles: [], groups: [])
  end

  test "a members map admits only users with a membership row" do
    map = make_map({ "kind" => "members" })
    assert_not map.accessible_to?(@user, roles: [], groups: [])

    Maps::MapMembership.create!(map: map, user: @user)
    assert map.accessible_to?(@user, roles: [], groups: [])
  end

  test "an unknown policy kind is rejected" do
    assert_raises(ActiveRecord::RecordInvalid) { make_map({ "kind" => "secret" }) }
  end

  test "a claim policy without a role or group is rejected" do
    assert_raises(ActiveRecord::RecordInvalid) { make_map({ "kind" => "claim" }) }
  end

  test "a user may not hold two memberships on one map" do
    map = make_map({ "kind" => "members" })
    Maps::MapMembership.create!(map: map, user: @user)

    assert_raises(ActiveRecord::RecordNotUnique) do
      Maps::MapMembership.create!(map: map, user: @user)
    end
  end
end
