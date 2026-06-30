require "test_helper"

module Api
  module V1
    # Saving a sprite manifest is gated on the `admin` realm role (#100); the
    # roster reads stay open to any authenticated user.
    class CharacterManifestsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "an admin can save a manifest" do
        assert_difference "CharacterManifest.count", 1 do
          post "/api/v1/character_manifests",
               params: { manifest: { name: "Hero" } },
               as: :json, headers: auth(@user, roles: ["admin"])
        end
        assert_response :success
        assert_equal "Hero", json[:name]
      end

      test "a non-admin is forbidden from saving a manifest" do
        assert_no_difference "CharacterManifest.count" do
          post "/api/v1/character_manifests",
               params: { manifest: { name: "Nope" } },
               as: :json, headers: auth(@user)
        end
        assert_response :forbidden
      end
    end
  end
end
