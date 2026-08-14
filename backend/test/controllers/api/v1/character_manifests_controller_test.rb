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
        assert_difference "::Character::CharacterManifest.count", 1 do
          post "/api/v1/character_manifests",
               params: { manifest: { name: "Hero" } },
               as: :json, headers: auth(@user, roles: ["admin"])
        end
        assert_response :success
        assert_equal "Hero", json[:name]
      end

      test "a non-admin is forbidden from saving a manifest" do
        assert_no_difference "::Character::CharacterManifest.count" do
          post "/api/v1/character_manifests",
               params: { manifest: { name: "Nope" } },
               as: :json, headers: auth(@user)
        end
        assert_response :forbidden
      end

      # Ownership + visibility (#394): the index lists house-owned rows only;
      # a caller's own personal rows are reachable explicitly with ?owner=me.

      test "index lists house-owned manifests and hides personal ones" do
        ::Character::CharacterManifest.create!(name: "House", data: {})
        ::Character::CharacterManifest.create!(name: "Mine", data: {}, owner: @user)

        get "/api/v1/character_manifests", headers: auth(@user)
        assert_response :success
        assert_equal ["House"], json.map { |m| m[:name] }
      end

      test "index with owner=me lists the caller's own rows" do
        _, other = setup_company(name: "Other")
        mine = ::Character::CharacterManifest.create!(name: "Mine", data: {}, owner: @user)
        ::Character::CharacterManifest.create!(name: "Theirs", data: {}, owner: other)
        ::Character::CharacterManifest.create!(name: "House", data: {})

        get "/api/v1/character_manifests", params: { owner: "me" }, headers: auth(@user)
        assert_response :success
        assert_equal [mine.id], json.map { |m| m[:id] }
      end

      test "show resolves the owner's own personal row" do
        mine = ::Character::CharacterManifest.create!(name: "Mine", data: {}, owner: @user)

        get "/api/v1/character_manifests/#{mine.id}", headers: auth(@user)
        assert_response :success
        assert_equal mine.id, json[:id]
      end

      test "show hides another user's personal row" do
        _, other = setup_company(name: "Other")
        theirs = ::Character::CharacterManifest.create!(name: "Theirs", data: {}, owner: other)

        get "/api/v1/character_manifests/#{theirs.id}", headers: auth(@user)
        assert_response :not_found
      end

      test "an admin-created manifest stays house-owned" do
        post "/api/v1/character_manifests",
             params: { manifest: { name: "Hero" } },
             as: :json, headers: auth(@user, roles: ["admin"])
        assert_response :success
        assert_nil ::Character::CharacterManifest.find_by(name: "Hero").owner_id
      end

      # Per-user selection (#155, ADR-0009): for_me resolves pick -> global
      # active -> 204; select persists the caller's pick.

      test "for_me returns the user's pick over the global active" do
        ::Character::CharacterManifest.create!(name: "Default", data: {}).activate!
        pick = ::Character::CharacterManifest.create!(name: "Mine", data: {})
        @user.update!(character_manifest: pick)

        get "/api/v1/character_manifests/for_me", headers: auth(@user)
        assert_response :success
        assert_equal pick.id, json[:id]
      end

      test "for_me falls back to the global active when the user has no pick" do
        active = ::Character::CharacterManifest.create!(name: "Default", data: {})
        active.activate!

        get "/api/v1/character_manifests/for_me", headers: auth(@user)
        assert_response :success
        assert_equal active.id, json[:id]
      end

      test "for_me without a token is unauthorized" do
        get "/api/v1/character_manifests/for_me"
        assert_response :unauthorized
      end

      test "for_me is 204 when there is no pick and no active manifest" do
        get "/api/v1/character_manifests/for_me", headers: auth(@user)
        assert_response :no_content
      end

      test "select persists the pick for the current user only" do
        pick = ::Character::CharacterManifest.create!(name: "Mine", data: {})
        _, other = setup_company(name: "Other")

        post "/api/v1/character_manifests/#{pick.id}/select", headers: auth(@user)
        assert_response :success
        assert_equal pick.id, @user.reload.character_manifest_id
        assert_nil other.reload.character_manifest_id
      end

      test "select requires authentication" do
        pick = ::Character::CharacterManifest.create!(name: "Mine", data: {})

        post "/api/v1/character_manifests/#{pick.id}/select"
        assert_response :unauthorized
        assert_nil @user.reload.character_manifest_id
      end
    end
  end
end
