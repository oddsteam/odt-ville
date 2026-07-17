require "test_helper"

# Pins the surface-role validation (#119). Inner (concave) corners join fill /
# edge / outer-corner as a taggable role, and — like outer corners — take a
# diagonal side.
class GroundTileTest < ActiveSupport::TestCase
  def build(**overrides)
    Catalog::GroundTile.new({
      tile_type: "grass", tileset: "Terrains", col: 1, row: 2, cell: 32
    }.merge(overrides))
  end

  test "an inner corner takes a diagonal side" do
    assert build(role: "inner", side: "NW").valid?
  end

  test "an inner corner rejects an orthogonal side" do
    tile = build(role: "inner", side: "N")
    refute tile.valid?
    assert_includes tile.errors[:side], "N is not valid for a inner tile"
  end

  test "inner is an accepted role" do
    assert_includes Catalog::GroundTile::ROLES, "inner"
  end
end
