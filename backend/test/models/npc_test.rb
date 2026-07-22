require "test_helper"

class NpcTest < ActiveSupport::TestCase
  def make(name:, level: nil, enabled: true)
    Catalog::Npc.create!(name: name, level: level, enabled: enabled)
  end

  test "name is required and unique" do
    make(name: "THE BOSS")
    dup = Catalog::Npc.new(name: "THE BOSS")
    assert_not dup.valid?
    assert_includes dup.errors[:name], "has already been taken"

    blank = Catalog::Npc.new
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

  test "art is a mapped rig, and an NPC with none is still valid" do
    rig = Character::CharacterManifest.create!(name: "rig", data: {})
    npc = Catalog::Npc.create!(name: "Rigged", character_manifest: rig)
    assert_equal rig.id, npc.reload.character_manifest_id

    assert make(name: "Unrigged").valid?, "identity does not depend on art"
  end

  test "deleting a rig leaves the NPC artless rather than deleting it" do
    rig = Character::CharacterManifest.create!(name: "rig", data: {})
    npc = Catalog::Npc.create!(name: "Rigged", character_manifest: rig)

    rig.destroy!

    assert_nil npc.reload.character_manifest_id
  end

  test "lives in the catalog_npcs table (ADR-0010 module prefix)" do
    assert_equal "catalog_npcs", Catalog::Npc.table_name
  end
end
