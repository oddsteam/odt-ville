require "test_helper"

module Api
  module V1
    class MonstersControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "index returns roster summaries (no image blob) with computed probability" do
        ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)
        ::Catalog::Monster.create!(name: "Wolf", image: "data:img", encounter_rate: 3)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        assert_equal %w[Slime Wolf], json.map { _1[:name] }
        assert_not json.first.key?(:image), "summary must omit the heavy image blob"

        by_name = json.index_by { _1[:name] }
        assert_in_delta 0.25, by_name["Slime"][:probability], 1e-9
        assert_in_delta 0.75, by_name["Wolf"][:probability], 1e-9
      end

      test "disabled monsters are excluded from the probability denominator" do
        ::Catalog::Monster.create!(name: "On", image: "data:img", encounter_rate: 2)
        ::Catalog::Monster.create!(name: "Off", image: "data:img", encounter_rate: 8, enabled: false)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        by_name = json.index_by { _1[:name] }
        assert_in_delta 1.0, by_name["On"][:probability], 1e-9
        assert_equal 0.0, by_name["Off"][:probability], "disabled monster shows 0%"
      end

      test "an all-disabled (zero-sum) pool yields 0 without divide-by-zero" do
        ::Catalog::Monster.create!(name: "A", image: "data:img", encounter_rate: 5, enabled: false)
        ::Catalog::Monster.create!(name: "B", image: "data:img", encounter_rate: 5, enabled: false)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        assert_equal [0.0, 0.0], json.map { _1[:probability] }
      end

      test "pool returns only enabled monsters with their image for the wild encounter table" do
        ::Catalog::Monster.create!(name: "On", image: "data:on", encounter_rate: 2, encounter_dialog: "A wild On stirs!")
        ::Catalog::Monster.create!(name: "Off", image: "data:off", encounter_rate: 8, enabled: false)

        get "/api/v1/monsters/pool", headers: auth(@user)

        assert_response :success
        assert_equal %w[On], json.map { _1[:name] }, "disabled monsters never spawn"
        entry = json.first
        assert_equal "data:on", entry[:image], "the pool carries the sprite image"
        assert_equal "A wild On stirs!", entry[:encounter_dialog], "the pool carries the authored dialog"
        assert_equal 2, entry[:encounter_rate]
        assert entry.key?(:id) && entry.key?(:name)
      end

      test "an unfiltered pool ignores the pool column — every enabled monster spawns (#87)" do
        ::Catalog::Monster.create!(name: "Grass", image: "data:g", encounter_rate: 1, pool: nil)
        ::Catalog::Monster.create!(name: "Cave", image: "data:c", encounter_rate: 1, pool: "cave")

        get "/api/v1/monsters/pool", headers: auth(@user)

        assert_response :success
        assert_equal %w[Cave Grass], json.map { _1[:name] }, "absent filter is today's global pool, byte-for-byte"
      end

      test "the pool filter narrows to one named group (#87)" do
        ::Catalog::Monster.create!(name: "Global", image: "data:x", encounter_rate: 1, pool: nil)
        ::Catalog::Monster.create!(name: "CaveBat", image: "data:b", encounter_rate: 1, pool: "cave")
        ::Catalog::Monster.create!(name: "PlazaRare", image: "data:r", encounter_rate: 1, pool: "plaza")
        ::Catalog::Monster.create!(name: "CaveOff", image: "data:o", encounter_rate: 1, pool: "cave", enabled: false)

        get "/api/v1/monsters/pool", params: { pool: "cave" }, headers: auth(@user)

        assert_response :success
        assert_equal %w[CaveBat], json.map { _1[:name] },
                     "only enabled monsters carrying the named pool spawn there"
      end

      test "a named pool with no monsters is empty, not the global pool (#87)" do
        ::Catalog::Monster.create!(name: "Global", image: "data:x", encounter_rate: 1, pool: nil)

        get "/api/v1/monsters/pool", params: { pool: "ghosts" }, headers: auth(@user)

        assert_response :success
        assert_equal [], json, "a named-but-unpopulated pool spawns nothing (the grass fallback is the game's job)"
      end

      test "a non-admin is forbidden from creating a monster" do
        assert_no_difference -> { ::Catalog::Monster.count } do
          post "/api/v1/monsters",
               params: { name: "Nope", image: "data:img", encounter_rate: 1 },
               headers: auth(@user)
        end
        assert_response :forbidden
      end

      test "create persists a monster and returns the full record incl. image" do
        assert_difference -> { ::Catalog::Monster.count }, 1 do
          post "/api/v1/monsters",
               params: { name: "Slime", image: "data:img", encounter_dialog: "A wild Slime appears!", encounter_rate: 5, enabled: true },
               headers: auth(@user, roles: ["admin"])
        end

        assert_response :created
        assert_equal "Slime", json[:name]
        assert_equal 5, json[:encounter_rate]
        assert_equal "A wild Slime appears!", json[:encounter_dialog]
        assert_equal true, json[:enabled]
        assert_equal "data:img", json[:image], "create returns the full record incl. the image data URL"
        assert_in_delta 1.0, json[:probability], 1e-9, "lone enabled monster is the whole pool"
      end

      test "create persists the pool tag and echoes it back (#87)" do
        post "/api/v1/monsters",
             params: { name: "Bat", image: "data:img", encounter_rate: 1, pool: "cave" },
             headers: auth(@user, roles: ["admin"])

        assert_response :created
        assert_equal "cave", json[:pool]
        assert_equal "cave", ::Catalog::Monster.find_by!(name: "Bat").pool
      end

      test "update sets the pool tag, and a blank clears it to nil (#87)" do
        monster = ::Catalog::Monster.create!(name: "Bat", image: "data:img", encounter_rate: 1)

        patch "/api/v1/monsters/#{monster.id}",
              params: { pool: "cave" },
              headers: auth(@user, roles: ["admin"])
        assert_response :success
        assert_equal "cave", json[:pool]

        patch "/api/v1/monsters/#{monster.id}",
              params: { pool: "" },
              headers: auth(@user, roles: ["admin"])
        assert_response :success
        assert_nil json[:pool]
        assert_nil monster.reload.pool, "a blank tag stores nil, so it never names a filterable group"
      end

      test "create defaults a missing enabled flag to on" do
        post "/api/v1/monsters",
             params: { name: "Wolf", image: "data:img", encounter_rate: 3 },
             headers: auth(@user, roles: ["admin"])

        assert_response :created
        assert_equal true, json[:enabled]
      end

      test "create rejects a duplicate name" do
        ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)

        assert_no_difference -> { ::Catalog::Monster.count } do
          post "/api/v1/monsters",
               params: { name: "Slime", image: "data:img", encounter_rate: 2 },
               headers: auth(@user, roles: ["admin"])
        end

        assert_response :unprocessable_entity
        assert json[:error].present?, "validation message surfaces to the admin"
      end

      test "create rejects a negative encounter rate" do
        assert_no_difference -> { ::Catalog::Monster.count } do
          post "/api/v1/monsters",
               params: { name: "Bad", image: "data:img", encounter_rate: -1 },
               headers: auth(@user, roles: ["admin"])
        end

        assert_response :unprocessable_entity
      end

      test "show returns the full record incl. the image data URL" do
        monster = ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 5)

        get "/api/v1/monsters/#{monster.id}", headers: auth(@user)

        assert_response :success
        assert_equal "Slime", json[:name]
        assert_equal "data:img", json[:image], "show returns the image so the edit form can pre-fill it"
      end

      test "update edits the record and returns the full updated record" do
        monster = ::Catalog::Monster.create!(name: "Slime", image: "data:old", encounter_rate: 1, encounter_dialog: "Hi", enabled: true)

        patch "/api/v1/monsters/#{monster.id}",
              params: { name: "Slime King", image: "data:new", encounter_dialog: "Bow!", encounter_rate: 4, enabled: false },
              headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal "Slime King", json[:name]
        assert_equal "data:new", json[:image]
        assert_equal "Bow!", json[:encounter_dialog]
        assert_equal 4, json[:encounter_rate]
        assert_equal false, json[:enabled]

        monster.reload
        assert_equal "Slime King", monster.name
        assert_equal "data:new", monster.image
      end

      test "update leaves the image unchanged when none is supplied" do
        monster = ::Catalog::Monster.create!(name: "Slime", image: "data:keep", encounter_rate: 1)

        patch "/api/v1/monsters/#{monster.id}",
              params: { encounter_rate: 9 },
              headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_equal 9, json[:encounter_rate]
        assert_equal "data:keep", json[:image], "omitting image leaves the stored blob untouched"
      end

      test "saving an edited rate recomputes probabilities across the pool" do
        slime = ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)
        ::Catalog::Monster.create!(name: "Wolf", image: "data:img", encounter_rate: 1)

        patch "/api/v1/monsters/#{slime.id}",
              params: { encounter_rate: 3 },
              headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_in_delta 0.75, json[:probability], 1e-9, "the edited monster's % reflects the new pool"

        get "/api/v1/monsters", headers: auth(@user)
        by_name = json.index_by { _1[:name] }
        assert_in_delta 0.75, by_name["Slime"][:probability], 1e-9
        assert_in_delta 0.25, by_name["Wolf"][:probability], 1e-9
      end

      test "destroy removes the monster and recomputes the remaining pool" do
        slime = ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)
        ::Catalog::Monster.create!(name: "Wolf", image: "data:img", encounter_rate: 1)

        assert_difference -> { ::Catalog::Monster.count }, -1 do
          delete "/api/v1/monsters/#{slime.id}", headers: auth(@user, roles: ["admin"])
        end

        assert_response :no_content
        assert_not ::Catalog::Monster.exists?(slime.id)

        get "/api/v1/monsters", headers: auth(@user)
        by_name = json.index_by { _1[:name] }
        assert_nil by_name["Slime"], "deleted monster is gone from the roster"
        assert_in_delta 1.0, by_name["Wolf"][:probability], 1e-9, "the survivor is now the whole pool"
      end

      test "update rejects a duplicate name" do
        ::Catalog::Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)
        wolf = ::Catalog::Monster.create!(name: "Wolf", image: "data:img", encounter_rate: 1)

        patch "/api/v1/monsters/#{wolf.id}",
              params: { name: "Slime" },
              headers: auth(@user, roles: ["admin"])

        assert_response :unprocessable_entity
        assert json[:error].present?, "validation message surfaces to the admin"
        assert_equal "Wolf", wolf.reload.name
      end
    end
  end
end
