require "test_helper"

class NpcTest < ActiveSupport::TestCase
  def make(name:, level: nil, enabled: true)
    Catalog::Npc.create!(name: name, image: "data:img", level: level, enabled: enabled)
  end

  test "name is required and unique" do
    make(name: "THE BOSS")
    dup = Catalog::Npc.new(name: "THE BOSS", image: "data:img")
    assert_not dup.valid?
    assert_includes dup.errors[:name], "has already been taken"

    blank = Catalog::Npc.new(image: "data:img")
    assert_not blank.valid?
  end

  test "level is optional — an NPC that never duels has none" do
    npc = make(name: "Wanderer")
    assert_nil npc.level
    assert npc.valid?
  end

  test "level is kept when set" do
    npc = make(name: "Duellist", level: 99)
    assert_equal 99, npc.reload.level
  end

  test "image_data_url seam reads and writes the image column" do
    npc = make(name: "Seam")
    npc.image_data_url = "data:image/png;base64,new"
    assert_equal "data:image/png;base64,new", npc.image
    assert_equal "data:image/png;base64,new", npc.image_data_url
  end

  test "lives in the catalog_npcs table (ADR-0010 module prefix)" do
    assert_equal "catalog_npcs", Catalog::Npc.table_name
  end
end
