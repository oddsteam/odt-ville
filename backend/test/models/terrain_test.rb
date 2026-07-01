require "test_helper"

class TerrainTest < ActiveSupport::TestCase
  test "name is required and unique" do
    Terrain.create!(name: "grass", priority: 0)
    dup = Terrain.new(name: "grass", priority: 1)
    assert_not dup.valid?
    assert_includes dup.errors[:name], "has already been taken"
    assert_not Terrain.new(priority: 0).valid?
  end

  test "ordered sorts low->high priority, name breaking ties" do
    Terrain.create!(name: "grass", priority: 2)
    Terrain.create!(name: "road", priority: 0)
    Terrain.create!(name: "dirt", priority: 1)
    assert_equal %w[road dirt grass], Terrain.ordered.pluck(:name)
  end

  test "register! adds an unknown terrain at the next-highest priority" do
    Terrain.create!(name: "road", priority: 0)
    Terrain.create!(name: "grass", priority: 1)
    Terrain.register!("lava")
    assert_equal 2, Terrain.find_by(name: "lava").priority
  end

  test "register! is idempotent and blank-safe" do
    Terrain.create!(name: "grass", priority: 5)
    assert_no_difference "Terrain.count" do
      Terrain.register!("grass")
      Terrain.register!("  ")
      Terrain.register!(nil)
    end
    assert_equal 5, Terrain.find_by(name: "grass").priority
  end

  test "reorder! sets priority from the ordered name list" do
    Terrain.create!(name: "road", priority: 0)
    Terrain.create!(name: "dirt", priority: 1)
    Terrain.create!(name: "grass", priority: 2)
    Terrain.reorder!(%w[grass dirt road])
    assert_equal %w[grass dirt road], Terrain.ordered.pluck(:name)
  end
end
