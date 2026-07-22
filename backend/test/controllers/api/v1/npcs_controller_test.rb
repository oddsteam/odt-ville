require "test_helper"

module Api
  module V1
    class NpcsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
        @rig = ::Character::CharacterManifest.create!(name: "boss-rig", data: {})
      end

      test "index returns the NPC catalog ordered by name, with its rig ref" do
        ::Catalog::Npc.create!(name: "THE BOSS", character_manifest: @rig, level: 99)
        ::Catalog::Npc.create!(name: "Apprentice")

        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_equal %w[Apprentice THE\ BOSS], json.map { _1[:name] }

        boss = json.index_by { _1[:name] }["THE BOSS"]
        assert_equal @rig.id, boss[:character_manifest_id], "the picker/runtime resolves art through the rig"
        assert_equal 99, boss[:level]
        assert boss.key?(:id) && boss.key?(:enabled)
      end

      test "an NPC with no level serializes level as null" do
        ::Catalog::Npc.create!(name: "Wanderer", character_manifest: @rig)

        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_nil json.first[:level]
      end

      test "an NPC with no rig yet serializes character_manifest_id as null" do
        ::Catalog::Npc.create!(name: "Unrigged")

        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_nil json.first[:character_manifest_id]
      end

      test "an empty catalog challenges nobody — an empty list, not an error" do
        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_equal [], json
      end

      test "a non-admin is forbidden from creating an NPC" do
        assert_no_difference -> { ::Catalog::Npc.count } do
          post "/api/v1/npcs", params: { name: "Nope" }, headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "create persists an NPC pointed at a mapped rig" do
        assert_difference -> { ::Catalog::Npc.count }, 1 do
          post "/api/v1/npcs",
               params: { name: "THE BOSS", character_manifest_id: @rig.id, level: 99, enabled: true },
               headers: auth(@user, roles: ["admin"])
        end

        assert_response :created
        assert_equal "THE BOSS", json[:name]
        assert_equal @rig.id, json[:character_manifest_id]
        assert_equal 99, json[:level]
        assert_equal true, json[:enabled]
      end

      test "create leaves level null when the admin omits it — an NPC need not duel" do
        post "/api/v1/npcs",
             params: { name: "Wanderer", character_manifest_id: @rig.id },
             headers: auth(@user, roles: ["admin"])

        assert_response :created
        assert_nil json[:level]
        assert_equal true, json[:enabled], "a new NPC is offered by the picker by default"
      end

      test "create rejects a duplicate name" do
        ::Catalog::Npc.create!(name: "THE BOSS", character_manifest: @rig)

        assert_no_difference -> { ::Catalog::Npc.count } do
          post "/api/v1/npcs",
               params: { name: "THE BOSS", character_manifest_id: @rig.id },
               headers: auth(@user, roles: ["admin"])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?, "validation message surfaces to the admin"
      end

      test "update edits the record and returns the full updated record" do
        other = ::Character::CharacterManifest.create!(name: "other-rig", data: {})
        npc = ::Catalog::Npc.create!(name: "Apprentice", character_manifest: @rig, level: 3)

        patch "/api/v1/npcs/#{npc.id}",
              params: { name: "Master", character_manifest_id: other.id, level: 50, enabled: false },
              headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal "Master", json[:name]
        assert_equal other.id, json[:character_manifest_id]
        assert_equal 50, json[:level]
        assert_equal false, json[:enabled]

        npc.reload
        assert_equal "Master", npc.name
        assert_equal other.id, npc.character_manifest_id
      end

      test "update leaves the rig unchanged when none is supplied" do
        npc = ::Catalog::Npc.create!(name: "Apprentice", character_manifest: @rig)

        patch "/api/v1/npcs/#{npc.id}",
              params: { level: 7 },
              headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal 7, json[:level]
        assert_equal @rig.id, json[:character_manifest_id], "omitting the rig keeps the stored one"
      end

      test "deleting the rig leaves the NPC artless, not deleted (ADR-0009's nullify)" do
        npc = ::Catalog::Npc.create!(name: "Apprentice", character_manifest: @rig)

        @rig.destroy!

        assert ::Catalog::Npc.exists?(npc.id), "an NPC's identity outlives its art"
        assert_nil npc.reload.character_manifest_id
      end

      test "a non-admin is forbidden from deleting an NPC" do
        npc = ::Catalog::Npc.create!(name: "Apprentice", character_manifest: @rig)

        assert_no_difference -> { ::Catalog::Npc.count } do
          delete "/api/v1/npcs/#{npc.id}", headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "destroy drops the NPC from the catalog" do
        npc = ::Catalog::Npc.create!(name: "Apprentice", character_manifest: @rig)

        assert_difference -> { ::Catalog::Npc.count }, -1 do
          delete "/api/v1/npcs/#{npc.id}", headers: auth(@user, roles: ["admin"])
        end
        assert_response :no_content
      end
    end
  end
end
