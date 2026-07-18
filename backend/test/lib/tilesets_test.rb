require "test_helper"

# Pins the tileset-rename helper (#229): it rewrites the ground-tile catalog and
# every shape inside a baked map atomically, is idempotent, and leaves
# non-matching names alone.
class TilesetsTest < ActiveSupport::TestCase
  OLD = "footpath_32x32".freeze
  NEW = "terrain/footpath_32x32".freeze

  def ground_tile(tileset:, col: 0, row: 0)
    Catalog::GroundTile.create!(tile_type: "grass", tileset: tileset, col: col, row: row, cell: 32)
  end

  def baked_map(slug:, baked:)
    Maps::Map.create!(slug: slug, title: slug.capitalize, cols: 2, rows: 1, baked: baked)
  end

  test "renames ground_tiles rows carrying the old tileset name" do
    tile = ground_tile(tileset: OLD)
    Tilesets.rename(OLD, NEW)
    assert_equal NEW, tile.reload.tileset
  end

  test "leaves non-matching ground_tiles untouched" do
    other = ground_tile(tileset: "VerifyEditor")
    Tilesets.rename(OLD, NEW)
    assert_equal "VerifyEditor", other.reload.tileset
  end

  test "renames every shape inside a baked map document" do
    map = baked_map(slug: "downtown", baked: {
      "tilesets" => [{ "name" => OLD, "cell" => 32 }, { "name" => "other", "cell" => 32 }],
      "tiles" => [[{ "tileset" => OLD, "frame" => 3 }, { "tileset" => "other", "frame" => 1 }]],
      "entities" => [{ "kind" => "prop", "tileset" => OLD, "frame" => 4, "x" => 0, "y" => 0 }],
      "ground" => {
        "cols" => 2, "rows" => 1,
        "tilesets" => [{ "name" => OLD, "cell" => 32 }],
        "cells" => [[[{ "tileset" => OLD, "frame" => 0, "depth" => 0 }], []]]
      }
    })

    Tilesets.rename(OLD, NEW)
    baked = map.reload.baked

    assert_equal NEW, baked["tilesets"][0]["name"]
    assert_equal "other", baked["tilesets"][1]["name"], "unrelated tileset stays"
    assert_equal NEW, baked["tiles"][0][0]["tileset"]
    assert_equal "other", baked["tiles"][0][1]["tileset"]
    assert_equal NEW, baked["entities"][0]["tileset"]
    assert_equal NEW, baked["ground"]["tilesets"][0]["name"]
    assert_equal NEW, baked["ground"]["cells"][0][0][0]["tileset"]
  end

  test "tolerates null cells in the flat tiles grid" do
    map = baked_map(slug: "sparse", baked: {
      "tilesets" => [{ "name" => OLD, "cell" => 32 }],
      "tiles" => [[nil, { "tileset" => OLD, "frame" => 1 }]],
      "entities" => []
    })

    Tilesets.rename(OLD, NEW)
    baked = map.reload.baked

    assert_nil baked["tiles"][0][0]
    assert_equal NEW, baked["tiles"][0][1]["tileset"]
  end

  test "is idempotent — re-running changes nothing further" do
    tile = ground_tile(tileset: OLD)
    map = baked_map(slug: "downtown", baked: {
      "tilesets" => [{ "name" => OLD, "cell" => 32 }],
      "tiles" => [[{ "tileset" => OLD, "frame" => 0 }, nil]],
      "entities" => []
    })

    Tilesets.rename(OLD, NEW)
    after_first = map.reload.baked
    Tilesets.rename(OLD, NEW)

    assert_equal NEW, tile.reload.tileset
    assert_equal after_first, map.reload.baked
  end

  test "leaves a baked map that references no matching tileset untouched" do
    baked = {
      "tilesets" => [{ "name" => "VerifyEditor", "cell" => 32 }],
      "tiles" => [[{ "tileset" => "VerifyEditor", "frame" => 0 }, nil]],
      "entities" => []
    }
    map = baked_map(slug: "verify", baked: baked)

    Tilesets.rename(OLD, NEW)

    assert_equal baked, map.reload.baked
  end
end
