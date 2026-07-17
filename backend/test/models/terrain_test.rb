require "test_helper"

class TerrainTest < ActiveSupport::TestCase
  test "name is required and unique" do
    Catalog::Terrain.create!(name: "grass", priority: 0)
    dup = Catalog::Terrain.new(name: "grass", priority: 1)
    assert_not dup.valid?
    assert_includes dup.errors[:name], "has already been taken"
    assert_not Catalog::Terrain.new(priority: 0).valid?
  end

  test "ordered sorts low->high priority, name breaking ties" do
    Catalog::Terrain.create!(name: "grass", priority: 2)
    Catalog::Terrain.create!(name: "road", priority: 0)
    Catalog::Terrain.create!(name: "dirt", priority: 1)
    assert_equal %w[road dirt grass], Catalog::Terrain.ordered.pluck(:name)
  end

  test "register! adds an unknown terrain at the next-highest priority" do
    Catalog::Terrain.create!(name: "road", priority: 0)
    Catalog::Terrain.create!(name: "grass", priority: 1)
    Catalog::Terrain.register!("lava")
    assert_equal 2, Catalog::Terrain.find_by(name: "lava").priority
  end

  test "register! is idempotent and blank-safe" do
    Catalog::Terrain.create!(name: "grass", priority: 5)
    assert_no_difference "Catalog::Terrain.count" do
      Catalog::Terrain.register!("grass")
      Catalog::Terrain.register!("  ")
      Catalog::Terrain.register!(nil)
    end
    assert_equal 5, Catalog::Terrain.find_by(name: "grass").priority
  end

  test "reorder! sets priority from the ordered name list" do
    Catalog::Terrain.create!(name: "road", priority: 0)
    Catalog::Terrain.create!(name: "dirt", priority: 1)
    Catalog::Terrain.create!(name: "grass", priority: 2)
    Catalog::Terrain.reorder!(%w[grass dirt road])
    assert_equal %w[grass dirt road], Catalog::Terrain.ordered.pluck(:name)
  end
end
