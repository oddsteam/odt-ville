require "test_helper"

module Api
  module V1
    class MonstersControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "index returns roster summaries (no image blob) with computed probability" do
        Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)
        Monster.create!(name: "Wolf", image: "data:img", encounter_rate: 3)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        assert_equal %w[Slime Wolf], json.map { _1[:name] }
        assert_not json.first.key?(:image), "summary must omit the heavy image blob"

        by_name = json.index_by { _1[:name] }
        assert_in_delta 0.25, by_name["Slime"][:probability], 1e-9
        assert_in_delta 0.75, by_name["Wolf"][:probability], 1e-9
      end

      test "disabled monsters are excluded from the probability denominator" do
        Monster.create!(name: "On", image: "data:img", encounter_rate: 2)
        Monster.create!(name: "Off", image: "data:img", encounter_rate: 8, enabled: false)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        by_name = json.index_by { _1[:name] }
        assert_in_delta 1.0, by_name["On"][:probability], 1e-9
        assert_equal 0.0, by_name["Off"][:probability], "disabled monster shows 0%"
      end

      test "an all-disabled (zero-sum) pool yields 0 without divide-by-zero" do
        Monster.create!(name: "A", image: "data:img", encounter_rate: 5, enabled: false)
        Monster.create!(name: "B", image: "data:img", encounter_rate: 5, enabled: false)

        get "/api/v1/monsters", headers: auth(@user)

        assert_response :success
        assert_equal [0.0, 0.0], json.map { _1[:probability] }
      end

      test "create persists a monster and returns the full record incl. image" do
        assert_difference -> { Monster.count }, 1 do
          post "/api/v1/monsters",
               params: { name: "Slime", image: "data:img", encounter_dialog: "A wild Slime appears!", encounter_rate: 5, enabled: true },
               headers: auth(@user)
        end

        assert_response :created
        assert_equal "Slime", json[:name]
        assert_equal 5, json[:encounter_rate]
        assert_equal "A wild Slime appears!", json[:encounter_dialog]
        assert_equal true, json[:enabled]
        assert_equal "data:img", json[:image], "create returns the full record incl. the image data URL"
        assert_in_delta 1.0, json[:probability], 1e-9, "lone enabled monster is the whole pool"
      end

      test "create defaults a missing enabled flag to on" do
        post "/api/v1/monsters",
             params: { name: "Wolf", image: "data:img", encounter_rate: 3 },
             headers: auth(@user)

        assert_response :created
        assert_equal true, json[:enabled]
      end

      test "create rejects a duplicate name" do
        Monster.create!(name: "Slime", image: "data:img", encounter_rate: 1)

        assert_no_difference -> { Monster.count } do
          post "/api/v1/monsters",
               params: { name: "Slime", image: "data:img", encounter_rate: 2 },
               headers: auth(@user)
        end

        assert_response :unprocessable_entity
        assert json[:error].present?, "validation message surfaces to the admin"
      end

      test "create rejects a negative encounter rate" do
        assert_no_difference -> { Monster.count } do
          post "/api/v1/monsters",
               params: { name: "Bad", image: "data:img", encounter_rate: -1 },
               headers: auth(@user)
        end

        assert_response :unprocessable_entity
      end
    end
  end
end
