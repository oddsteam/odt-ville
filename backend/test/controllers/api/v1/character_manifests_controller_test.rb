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

      # A personal Look is READABLE by id by any authenticated user (#398): a peer
      # must fetch the recipe to bake and render the wearer in the shared village
      # (#397). Privacy is about listing (index stays house-owned) and actions
      # (save/select stay owner-scoped), never the render read — presence already
      # broadcasts the manifest id to everyone on the map.
      test "show returns another user's personal Look so peers can render it" do
        _, other = setup_company(name: "Other")
        theirs = ::Character::CharacterManifest.create!(name: "Theirs", data: {}, owner: other)

        get "/api/v1/character_manifests/#{theirs.id}", headers: auth(@user)
        assert_response :success
        assert_equal theirs.id, json[:id]
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

      # Personal Looks (#398, ADR-0017): a Look is a personal CharacterManifest
      # with data.parts (pack-scoped names) + data.layout, no data.sheet. Saved
      # by any authenticated user via POST .../looks, capped at three, and worn
      # via the existing select.

      LAYOUT = { "name" => "modern-interiors", "atlas" => { "width" => 256, "height" => 256 } }.freeze

      def look_params(parts:, name: nil)
        { manifest: { name: name, parts: parts, layout: LAYOUT }.compact }
      end

      def valid_parts(accessories: 1)
        %w[body-01 eyes-01 outfit-01-01 hairstyle-01-01] +
          Array.new(accessories) { |i| "accessory-0#{i + 1}-01" }
      end

      # Slice 1 — save a personal Look

      test "an authenticated user saves a personal Look, owned by them and not globally active" do
        assert_difference "::Character::CharacterManifest.count", 1 do
          post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts),
               as: :json, headers: auth(@user)
        end
        assert_response :success
        saved = ::Character::CharacterManifest.find(json[:id])
        assert_equal @user.id, saved.owner_id
        assert_not saved.active
        assert_equal valid_parts, json[:data][:parts]
      end

      test "saving a Look does not require the admin role" do
        post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts),
             as: :json, headers: auth(@user)
        assert_response :success
      end

      test "a saved Look stays out of the house-owned roster" do
        post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts),
             as: :json, headers: auth(@user)
        get "/api/v1/character_manifests", headers: auth(@user)
        assert_empty json
      end

      # Slice 2 — slot rules enforced server-side

      test "a Look requires a body" do
        post "/api/v1/character_manifests/looks",
             params: look_params(parts: %w[eyes-01 outfit-01-01]),
             as: :json, headers: auth(@user)
        assert_response :unprocessable_entity
      end

      test "a Look requires eyes" do
        post "/api/v1/character_manifests/looks",
             params: look_params(parts: %w[body-01 outfit-01-01]),
             as: :json, headers: auth(@user)
        assert_response :unprocessable_entity
      end

      test "a Look with only body and eyes is valid (outfit and hairstyle optional)" do
        post "/api/v1/character_manifests/looks",
             params: look_params(parts: %w[body-01 eyes-01]),
             as: :json, headers: auth(@user)
        assert_response :success
      end

      test "a Look accepts up to two accessories" do
        post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts(accessories: 2)),
             as: :json, headers: auth(@user)
        assert_response :success
      end

      test "a Look rejects a third accessory" do
        post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts(accessories: 3)),
             as: :json, headers: auth(@user)
        assert_response :unprocessable_entity
      end

      # Slice 3 — cap of three

      test "a user holds at most three Looks and the fourth is refused with a clear message" do
        3.times do |i|
          ::Character::CharacterManifest.create!(name: "L#{i}", owner: @user, data: { "parts" => valid_parts })
        end
        assert_no_difference "::Character::CharacterManifest.count" do
          post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts),
               as: :json, headers: auth(@user)
        end
        assert_response :unprocessable_entity
        assert_match(/three/i, json[:error])
      end

      # Slice 4 — delete frees a slot and falls back cleanly

      test "deleting a Look frees a slot" do
        looks = 3.times.map do |i|
          ::Character::CharacterManifest.create!(name: "L#{i}", owner: @user, data: { "parts" => valid_parts })
        end
        delete "/api/v1/character_manifests/#{looks.first.id}", headers: auth(@user)
        assert_response :no_content
        post "/api/v1/character_manifests/looks", params: look_params(parts: valid_parts),
             as: :json, headers: auth(@user)
        assert_response :success
      end

      test "a user cannot delete another user's Look" do
        _, other = setup_company(name: "Other")
        theirs = ::Character::CharacterManifest.create!(name: "Theirs", owner: other, data: { "parts" => valid_parts })
        assert_no_difference "::Character::CharacterManifest.count" do
          delete "/api/v1/character_manifests/#{theirs.id}", headers: auth(@user)
        end
        assert_response :not_found
      end

      test "a user cannot delete a house-owned manifest" do
        house = ::Character::CharacterManifest.create!(name: "House", data: {})
        delete "/api/v1/character_manifests/#{house.id}", headers: auth(@user)
        assert_response :not_found
        assert ::Character::CharacterManifest.exists?(house.id)
      end

      test "deleting a worn Look falls back to the global active manifest" do
        active = ::Character::CharacterManifest.create!(name: "Default", data: {})
        active.activate!
        worn = ::Character::CharacterManifest.create!(name: "Worn", owner: @user, data: { "parts" => valid_parts })
        @user.update!(character_manifest: worn)

        delete "/api/v1/character_manifests/#{worn.id}", headers: auth(@user)
        assert_response :no_content
        assert_nil @user.reload.character_manifest_id

        get "/api/v1/character_manifests/for_me", headers: auth(@user)
        assert_response :success
        assert_equal active.id, json[:id]
      end

      # Slice 5 — a user cannot wear another user's personal Look

      test "a user cannot select another user's personal Look" do
        _, other = setup_company(name: "Other")
        theirs = ::Character::CharacterManifest.create!(name: "Theirs", owner: other, data: { "parts" => valid_parts })
        post "/api/v1/character_manifests/#{theirs.id}/select", headers: auth(@user)
        assert_response :not_found
        assert_nil @user.reload.character_manifest_id
      end
    end
  end
end
