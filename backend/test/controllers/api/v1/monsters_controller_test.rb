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
    end
  end
end
