require "test_helper"

module Api
  module V1
    class MapsControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
        # The playability validator (#82) checks painted terrain against the
        # catalog; every create_params document paints grass.
        ::Catalog::Terrain.register!("grass")
      end

      # A minimal baked authored map: a 1x1 grass grid plus one prop. Mirrors the
      # seed fixture's shape so the request spec pins the contract MapSerializer
      # publishes.
      def make_map(slug: "atrium", title: "The Atrium", policy: nil)
        ::Maps::Map.create!(
          slug: slug,
          title: title,
          access_policy: policy || { "kind" => "public" },
          cols: 1,
          rows: 1,
          baked: {
            "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
            "tiles" => [[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 0 }]],
            "entities" => [
              { "kind" => "prop", "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 5, "x" => 0, "y" => 0 }
            ]
          }
        )
      end

      test "show returns the baked map for a known slug" do
        make_map

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal "atrium", body[:slug]
        assert_equal "The Atrium", body[:title]
        assert_equal 1, body[:cols]
        assert_equal 1, body[:rows]
        assert_equal [{ name: "terrain/1_Terrains_and_Fences_32x32", cell: 32 }], body[:tilesets]
        assert_equal [[{ tileset: "terrain/1_Terrains_and_Fences_32x32", frame: 0 }]], body[:tiles]
        assert_equal 1, body[:entities].length
        assert_equal "prop", body[:entities].first[:kind]
      end

      test "show does not expose the editable source document on the play endpoint" do
        make_map

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        assert_not_includes json.keys, :source
      end

      test "show returns 404 for an unknown slug" do
        get "/api/v1/maps/does-not-exist", headers: auth(@user)

        assert_response :not_found
        assert json[:error].present?
      end

      # Index (map picker, decoupling collision from create): the admin console
      # lists saved maps by identity only — never the heavy baked/source jsonb —
      # so the author can pick one to paint collision on.
      test "index lists saved maps for an admin" do
        make_map(slug: "atrium", title: "The Atrium")
        make_painted_map(slug: "grove")

        get "/api/v1/maps", headers: auth(@user, roles: ["admin"])

        assert_response :success
        atrium = json.find { |m| m[:slug] == "atrium" }
        assert_equal "The Atrium", atrium[:title]
        assert_equal 1, atrium[:cols]
        assert_equal 1, atrium[:rows]
        assert_includes json.map { |m| m[:slug] }, "grove"
      end

      test "index omits the heavy baked and source documents" do
        make_map

        get "/api/v1/maps", headers: auth(@user, roles: ["admin"])

        assert_response :success
        assert_not_includes json.first.keys, :baked
        assert_not_includes json.first.keys, :source
      end

      # Access policy (#83): list and load are gated server-side — no
      # client-side hiding. The list is per-user, so it is no longer
      # admin-only (supersedes the #100 gate on index).
      test "index lists public maps for any authenticated user" do
        make_map

        get "/api/v1/maps", headers: auth(@user)

        assert_response :success
        assert_equal ["atrium"], json.map { |m| m[:slug] }
      end

      test "index omits maps the user cannot access" do
        make_map(slug: "open")
        make_map(slug: "staff-room", policy: { "kind" => "claim", "role" => "staff" })
        make_map(slug: "clubhouse", policy: { "kind" => "members" })

        get "/api/v1/maps", headers: auth(@user)

        assert_equal ["open"], json.map { |m| m[:slug] }
      end

      test "index includes a claim-gated map for a user with the matching role" do
        make_map(slug: "staff-room", policy: { "kind" => "claim", "role" => "staff" })

        get "/api/v1/maps", headers: auth(@user, roles: ["staff"])

        assert_equal ["staff-room"], json.map { |m| m[:slug] }
      end

      test "index includes a members map for a member" do
        map = make_map(slug: "clubhouse", policy: { "kind" => "members" })
        ::Maps::MapMembership.create!(map: map, user: @user)

        get "/api/v1/maps", headers: auth(@user)

        assert_equal ["clubhouse"], json.map { |m| m[:slug] }
      end

      test "show returns 403 for a map the user cannot access" do
        make_map(slug: "staff-room", policy: { "kind" => "claim", "role" => "staff" })

        get "/api/v1/maps/staff-room", headers: auth(@user)

        assert_response :forbidden
        assert json[:error].present?
      end

      test "show loads a claim-gated map for a user with the matching role" do
        make_map(slug: "staff-room", policy: { "kind" => "claim", "role" => "staff" })

        get "/api/v1/maps/staff-room", headers: auth(@user, roles: ["staff"])

        assert_response :success
        assert_equal "staff-room", json[:slug]
      end

      test "show returns 403 for a members map until the user is a member" do
        map = make_map(slug: "clubhouse", policy: { "kind" => "members" })

        get "/api/v1/maps/clubhouse", headers: auth(@user)
        assert_response :forbidden

        ::Maps::MapMembership.create!(map: map, user: @user)
        get "/api/v1/maps/clubhouse", headers: auth(@user)
        assert_response :success
      end

      # A painted authored map (#106/#107) bakes to a `ground` — per-cell layer
      # stacks — instead of the seed's flat `tiles`. The serializer must publish
      # that ground and lift its tilesets to the top-level list the runtime
      # preloads (the runtime blits whichever shape the producer supplied).
      def make_painted_map(slug: "grove")
        ::Maps::Map.create!(
          slug: slug,
          title: "The Grove",
          cols: 1,
          rows: 1,
          baked: {
            "ground" => {
              "cols" => 1,
              "rows" => 1,
              "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
              "cells" => [[[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 2, "depth" => 0.2 }]]]
            }
          }
        )
      end

      test "show publishes the baked ground for a painted map" do
        make_painted_map

        get "/api/v1/maps/grove", headers: auth(@user)

        assert_response :success
        body = json
        assert_equal 1, body[:ground][:cols]
        assert_equal(
          [[[{ tileset: "terrain/1_Terrains_and_Fences_32x32", frame: 2, depth: 0.2 }]]],
          body[:ground][:cells]
        )
      end

      test "show lifts a painted map's ground tilesets to the top-level list" do
        make_painted_map

        get "/api/v1/maps/grove", headers: auth(@user)

        assert_response :success
        # No flat `tiles`, so the runtime learns which sheets to load from ground.
        assert_equal [{ name: "terrain/1_Terrains_and_Fences_32x32", cell: 32 }], json[:tilesets]
      end

      # A create payload mirroring what the editor POSTs (#105): identity, size,
      # the editable `source` and its baked artifact. The baked shape is opaque
      # jsonb the server persists verbatim, so nested arrays must survive strong
      # params intact.
      def create_params(slug: "atrium", title: "The Atrium", cols: 1, rows: 1)
        {
          slug: slug,
          title: title,
          cols: cols,
          rows: rows,
          source: { "terrain" => [["grass"]] },
          baked: {
            "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
            "tiles" => [[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 0 }]],
            "entities" => []
          }
        }
      end

      test "an admin creates a map and gets it back serialized (201)" do
        assert_difference "::Maps::Map.count", 1 do
          post "/api/v1/maps", params: create_params, headers: auth(@user, roles: ["admin"]), as: :json
        end

        assert_response :created
        body = json
        assert_equal "atrium", body[:slug]
        assert_equal "The Atrium", body[:title]
        # The opaque baked jsonb survived strong params and round-trips through
        # the serializer — nested arrays and all.
        assert_equal [[{ tileset: "terrain/1_Terrains_and_Fences_32x32", frame: 0 }]], body[:tiles]
      end

      test "the created map is immediately readable at its slug" do
        post "/api/v1/maps", params: create_params, headers: auth(@user, roles: ["admin"]), as: :json
        assert_response :created

        get "/api/v1/maps/atrium", headers: auth(@user)
        assert_response :success
        assert_equal "atrium", json[:slug]
      end

      test "a non-admin is forbidden from creating a map" do
        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: create_params, headers: auth(@user), as: :json
        end
        assert_response :forbidden
      end

      test "a duplicate slug is rejected with 422" do
        make_map(slug: "atrium")

        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: create_params(slug: "atrium"), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "non-positive dimensions are rejected with 422" do
        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: create_params(cols: 0, rows: -1), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
        assert json[:error].present?
      end

      test "a blank title is rejected with 422" do
        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: create_params(title: ""), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
      end

      test "an unplayable document is rejected with 422 and an actionable reason" do
        # The playability validator (#82): a dangling portal is one of its
        # rejects; the reason names the zone and target so the author can fix it.
        unplayable = create_params.merge(baked: create_params[:baked].merge(
          "zones" => [{ "trigger" => "on_enter", "x" => 0, "y" => 0,
                        "payload" => { "kind" => "portal", "targetNode" => "nowhere" } }]
        ))

        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: unplayable, headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
        assert_match(/portal at \(0, 0\) targets unknown map "nowhere"/, json[:error])
      end

      test "a posted painted map round-trips its deep ground.cells through strong params" do
        painted = create_params(slug: "grove", title: "The Grove").merge(
          baked: {
            "ground" => {
              "cols" => 1, "rows" => 1,
              "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
              "cells" => [[[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 2, "depth" => 0.2 }]]]
            }
          }
        )
        post "/api/v1/maps", params: painted, headers: auth(@user, roles: ["admin"]), as: :json
        assert_response :created

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_equal(
          [[[{ tileset: "terrain/1_Terrains_and_Fences_32x32", frame: 2, depth: 0.2 }]]],
          json[:ground][:cells]
        )
      end

      test "a Tiled-imported map records producer 'tiled' and round-trips it" do
        # The editor stores the terrain producer inside baked (ADR-0007) so the
        # play endpoint and editor both know the terrain came from Tiled.
        tiled = create_params(slug: "downtown", title: "Downtown").merge(
          source: { "type" => "map", "tilesets" => [] },
          baked: {
            "producer" => "tiled",
            "ground" => {
              "cols" => 1, "rows" => 1,
              "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
              "cells" => [[[{ "tileset" => "terrain/1_Terrains_and_Fences_32x32", "frame" => 2, "depth" => 0 }]]]
            }
          }
        )
        post "/api/v1/maps", params: tiled, headers: auth(@user, roles: ["admin"]), as: :json
        assert_response :created

        get "/api/v1/maps/downtown", headers: auth(@user)
        assert_equal "tiled", json[:producer]
      end

      test "a painted map omits the producer key entirely" do
        make_painted_map

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_not_includes json.keys, :producer
      end

      test "a posted collision mask round-trips through strong params and the serializer" do
        # The collision mask (#131) is authored data on the baked document — a
        # per-cell blocked grid the runtime ANDs into walkability. It must survive
        # strong params (nested boolean arrays) and be republished on the play
        # endpoint so the avatar is blocked at its masked cells.
        masked = create_params(slug: "grove", title: "The Grove", cols: 2, rows: 1).merge(
          baked: {
            "ground" => {
              "cols" => 2, "rows" => 1,
              "tilesets" => [{ "name" => "terrain/1_Terrains_and_Fences_32x32", "cell" => 32 }],
              "cells" => [[[], []]]
            },
            "collision" => [[true, false]]
          }
        )
        post "/api/v1/maps", params: masked, headers: auth(@user, roles: ["admin"]), as: :json
        assert_response :created

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_equal [[true, false]], json[:collision]
      end

      test "show publishes the baked zones with trigger and payload" do
        # Zones (#85, ADR-0005): interactive regions on the baked document —
        # a trigger enum + a payload keyed by kind, republished verbatim so the
        # runtime's detector can fire onZone.
        make_map(slug: "plaza", title: "The Plaza")
        map = make_map
        map.update!(baked: map.baked.merge(
          "zones" => [{ "trigger" => "on_enter", "x" => 0, "y" => 0,
                        "payload" => { "kind" => "portal", "targetNode" => "plaza" } }]
        ))

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        assert_equal(
          [{ trigger: "on_enter", x: 0, y: 0, payload: { kind: "portal", targetNode: "plaza" } }],
          json[:zones]
        )
      end

      test "show publishes the baked spawns so a portal can land on a named entry point" do
        # Named entry spawns (#84): where a portal's entrySpawnId places the
        # avatar on this map, republished verbatim like zones.
        map = make_map
        map.update!(baked: map.baked.merge(
          "spawns" => [{ "id" => "from-plaza", "x" => 1, "y" => 4 }]
        ))

        get "/api/v1/maps/atrium", headers: auth(@user)

        assert_response :success
        assert_equal [{ id: "from-plaza", x: 1, y: 4 }], json[:spawns]
      end

      test "a map with no zones omits the zones key entirely" do
        make_map

        get "/api/v1/maps/atrium", headers: auth(@user)
        assert_not_includes json.keys, :zones
      end

      test "a map with nothing masked omits the collision key entirely" do
        make_painted_map

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_not_includes json.keys, :collision
      end

      # Update (decoupling collision from create): re-paint a saved map's collision
      # mask without recreating it. The editor loads a map by slug, paints, then
      # PATCHes the mask under `baked` — the same opaque jsonb create stores.
      test "an admin updates a saved map's collision mask" do
        make_painted_map(slug: "grove")

        patch "/api/v1/maps/grove",
          params: { baked: { collision: [[true, false]] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        assert_equal [[true, false]], json[:collision]

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_equal [[true, false]], json[:collision]
      end

      test "updating collision preserves the existing baked ground" do
        make_painted_map(slug: "grove")

        patch "/api/v1/maps/grove",
          params: { baked: { collision: [[true]] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        # Only collision changed — the ground the map was created with survives.
        assert_equal 1, json[:ground][:cols]
      end

      test "a cleared collision mask drops the key entirely" do
        map = make_painted_map(slug: "grove")
        map.update!(baked: map.baked.merge("collision" => [[true]]))

        patch "/api/v1/maps/grove",
          params: { baked: { collision: nil } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        assert_not_includes json.keys, :collision
      end

      test "a non-admin is forbidden from updating a map" do
        make_painted_map(slug: "grove")

        patch "/api/v1/maps/grove",
          params: { baked: { collision: [[true]] } },
          headers: auth(@user), as: :json

        assert_response :forbidden
      end

      # Props (#139, ADR-0008): the decorate editor PATCHes placed props as
      # *object references* — `{kind:"prop", object_id, x, y}`, art fetched by
      # id at play — under the same opaque baked jsonb the collision patch uses.
      # A saved catalog object placed props may reference — the playability
      # validator (#82) rejects a dangling object_id.
      def make_object
        ::Catalog::TileObject.create!(name: "Marker", kind: "prop", image: "marker.png")
      end

      test "an admin saves placed props onto a map as object references" do
        make_painted_map(slug: "grove")
        object = make_object

        patch "/api/v1/maps/grove",
          params: { baked: { entities: [{ kind: "prop", object_id: object.id, x: 0, y: 0 }] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        assert_equal 1, json[:entities].length
        assert_equal object.id, json[:entities].first[:object_id]

        get "/api/v1/maps/grove", headers: auth(@user)
        assert_equal object.id, json[:entities].first[:object_id]
      end

      test "clearing all props drops the entities key entirely" do
        map = make_painted_map(slug: "grove")
        map.update!(baked: map.baked.merge(
          "entities" => [{ "kind" => "prop", "object_id" => make_object.id, "x" => 0, "y" => 0 }]
        ))

        patch "/api/v1/maps/grove",
          params: { baked: { entities: [] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        assert_equal [], json[:entities]
        assert_not_includes ::Maps::Map.find_by!(slug: "grove").baked.keys, "entities"
      end

      # Zones (#90, ADR-0005): the decorate editor PATCHes the authored zones —
      # trigger + payload regions — as full desired state under the same baked
      # jsonb, alongside collision and entities.
      test "an admin saves authored zones onto a map" do
        make_painted_map(slug: "grove")

        patch "/api/v1/maps/grove",
          params: { baked: { zones: [{ trigger: "interact", x: 0, y: 0,
                                       payload: { kind: "link", url: "https://odds.team" } }] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        get "/api/v1/maps/grove", headers: auth(@user)
        assert_equal "https://odds.team", json[:zones].first[:payload][:url]
      end

      test "clearing all zones drops the zones key entirely" do
        map = make_painted_map(slug: "grove")
        map.update!(baked: map.baked.merge(
          "zones" => [{ "trigger" => "on_enter", "x" => 0, "y" => 0,
                        "payload" => { "kind" => "portal", "targetNode" => "town" } }]
        ))

        patch "/api/v1/maps/grove",
          params: { baked: { zones: [] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :success
        assert_not_includes ::Maps::Map.find_by!(slug: "grove").baked.keys, "zones"
      end

      test "updating an unknown slug returns 404" do
        patch "/api/v1/maps/does-not-exist",
          params: { baked: { collision: [[true]] } },
          headers: auth(@user, roles: ["admin"]), as: :json

        assert_response :not_found
      end

      test "a malformed slug is rejected with 422" do
        assert_no_difference "::Maps::Map.count" do
          post "/api/v1/maps", params: create_params(slug: "Not A Slug"), headers: auth(@user, roles: ["admin"]), as: :json
        end
        assert_response :unprocessable_entity
      end
    end
  end
end
