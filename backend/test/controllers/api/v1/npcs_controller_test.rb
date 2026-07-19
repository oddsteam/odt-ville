require "test_helper"

module Api
  module V1
    class NpcsControllerTest < ActionDispatch::IntegrationTest
      setup do
        _, @user = setup_company
      end

      test "index returns the NPC catalog ordered by name, with the sprite image" do
        ::Catalog::Npc.create!(name: "THE BOSS", image: "data:boss", level: 99)
        ::Catalog::Npc.create!(name: "Apprentice", image: "data:app")

        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_equal %w[Apprentice THE\ BOSS], json.map { _1[:name] }

        boss = json.index_by { _1[:name] }["THE BOSS"]
        assert_equal "data:boss", boss[:image], "the picker/runtime needs the duel sprite"
        assert_equal 99, boss[:level]
        assert boss.key?(:id) && boss.key?(:enabled)
      end

      test "an NPC with no level serializes level as null" do
        ::Catalog::Npc.create!(name: "Wanderer", image: "data:w")

        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_nil json.first[:level]
      end

      test "an empty catalog challenges nobody — an empty list, not an error" do
        get "/api/v1/npcs", headers: auth(@user)

        assert_response :success
        assert_equal [], json
      end
    end
  end
end
