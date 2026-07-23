require "test_helper"

module Voice
  class RoomTokenTest < ActiveSupport::TestCase
    SECRET = "test-secret"

    def claims(jwt)
      JWT.decode(jwt, SECRET, true, algorithm: "HS256").first
    end

    test "the token names the connecting user as its subject" do
      jwt = RoomToken.mint(identity: "user-123", name: "Alice", room: "map-town",
                           api_key: "test-key", api_secret: SECRET)

      assert_equal "user-123", claims(jwt)["sub"]
      assert_equal "Alice", claims(jwt)["name"]
    end

    test "the token carries a join grant for the requested room" do
      jwt = RoomToken.mint(identity: "user-123", name: "Alice", room: "map-town",
                           api_key: "test-key", api_secret: SECRET)

      grant = claims(jwt)["video"]
      assert_equal true, grant["roomJoin"]
      assert_equal "map-town", grant["room"]
    end

    test "the token is signed by the api secret" do
      jwt = RoomToken.mint(identity: "u", name: "n", room: "r",
                           api_key: "test-key", api_secret: SECRET)

      assert_raises(JWT::VerificationError) do
        JWT.decode(jwt, "wrong-secret", true, algorithm: "HS256")
      end
    end
  end
end
