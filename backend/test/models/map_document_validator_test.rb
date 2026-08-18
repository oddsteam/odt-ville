require "test_helper"

# Save-time playability validation (#82): an unplayable map document is
# rejected at create!/update! with a reason specific enough to act on —
# unknown catalog references, dangling portal targets/spawns, unreachable
# doors. A valid document saves.
class MapDocumentValidatorTest < ActiveSupport::TestCase
  def make_map(slug: "atrium", baked: {}, source: {})
    Maps::Map.create!(slug: slug, title: slug.titleize, cols: 8, rows: 6, baked: baked, source: source)
  end

  test "an entity referencing an unknown catalog object is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: { "entities" => [{ "kind" => "prop", "object_id" => 999_999, "x" => 2, "y" => 3 }] })
    end
    assert_match(/entity at \(2, 3\) references unknown object 999999/, error.message)
  end

  test "a painted terrain missing from the catalog is rejected with a reason" do
    Catalog::Terrain.register!("grass")

    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(source: { "terrain" => [["grass", "lava"]] })
    end
    assert_match(/terrain "lava" is not in the catalog/, error.message)
  end

  test "painted terrain from the catalog is accepted, unpainted cells ignored" do
    Catalog::Terrain.register!("grass")

    assert make_map(source: { "terrain" => [["grass", nil]] })
  end

  test "an entity referencing a saved catalog object is accepted" do
    object = Catalog::TileObject.create!(name: "Bench", kind: "prop", image: "bench.png")

    assert make_map(baked: { "entities" => [{ "kind" => "prop", "object_id" => object.id, "x" => 0, "y" => 0 }] })
  end

  def portal(target, spawn: nil, x: 1, y: 1)
    payload = { "kind" => "portal", "targetNode" => target }
    payload["entrySpawnId"] = spawn if spawn
    { "trigger" => "on_enter", "x" => x, "y" => y, "payload" => payload }
  end

  # The sight cone (#86) is the one trigger carrying geometry of its own: the
  # client schema ties `facing` to `on_sight`, so a cone saved without one
  # would break the map at load. Refuse it at the boundary instead.
  test "a sight cone with no facing is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: { "zones" => [
        { "trigger" => "on_sight", "x" => 2, "y" => 3, "range" => 3,
          "payload" => { "kind" => "link", "url" => "https://d.x" } }
      ] })
    end
    assert_match(/sight zone at \(2, 3\) has no facing/, error.message)
  end

  test "a sight cone with an unknown facing is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: { "zones" => [
        { "trigger" => "on_sight", "x" => 2, "y" => 3, "facing" => "sideways",
          "payload" => { "kind" => "link", "url" => "https://d.x" } }
      ] })
    end
    assert_match(/sight zone at \(2, 3\) faces "sideways"/, error.message)
  end

  test "a sight cone facing a known direction is accepted" do
    assert make_map(baked: { "zones" => [
      { "trigger" => "on_sight", "x" => 2, "y" => 3, "facing" => "up", "range" => 3,
        "payload" => { "kind" => "link", "url" => "https://d.x" } }
    ] })
  end

  test "a portal targeting a map that does not exist is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: { "zones" => [portal("nowhere")] })
    end
    assert_match(/portal at \(1, 1\) targets unknown map "nowhere"/, error.message)
  end

  test "a portal targeting a saved map, the map itself, or the reserved town hub is accepted" do
    make_map(slug: "plaza")

    assert make_map(slug: "atrium", baked: { "zones" => [
      portal("plaza"), portal("atrium"), portal("town")
    ] })
  end

  test "a portal naming an entry spawn the target map does not have is rejected with a reason" do
    make_map(slug: "plaza", baked: { "spawns" => [{ "id" => "gate", "x" => 0, "y" => 0 }] })

    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(slug: "atrium", baked: { "zones" => [portal("plaza", spawn: "dock")] })
    end
    assert_match(/portal at \(1, 1\) targets map "plaza" spawn "dock", which does not exist/, error.message)
  end

  test "a portal naming a spawn the target map has is accepted, including on the map itself" do
    make_map(slug: "plaza", baked: { "spawns" => [{ "id" => "gate", "x" => 0, "y" => 0 }] })

    assert make_map(slug: "atrium", baked: {
      "spawns" => [{ "id" => "home", "x" => 2, "y" => 2 }],
      "zones" => [portal("plaza", spawn: "gate"), portal("atrium", spawn: "home")]
    })
  end

  # A meeting room (#485) names only its room. A blank roomId can't be joined —
  # the resolver (#486) keys the LiveKit room off it — so it is refused at save.
  test "a meeting zone with a blank roomId is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: { "zones" => [
        { "trigger" => "on_enter", "x" => 4, "y" => 5, "payload" => { "kind" => "meeting", "roomId" => "  " } }
      ] })
    end
    assert_match(/meeting zone at \(4, 5\) has a blank roomId/, error.message)
  end

  test "a meeting zone with a roomId is accepted" do
    assert make_map(baked: { "zones" => [
      { "trigger" => "on_enter", "x" => 4, "y" => 5, "payload" => { "kind" => "meeting", "roomId" => "room-1a2b" } }
    ] })
  end

  # A 1×1 house whose door is its own footprint cell at (0,0) — the walk-mask
  # solid, the door the carved entry (mirrors MapScene's door override).
  def house_with_door
    { "kind" => "house", "tileset" => "t", "frame" => 0, "x" => 0, "y" => 0,
      "walk_mask" => ["#"], "door_dx" => 0, "door_dy" => 0 }
  end

  # 8×6 all-clear collision grid; block the given cells.
  def collision(*blocked)
    grid = Array.new(6) { Array.new(8, false) }
    blocked.each { |(x, y)| grid[y][x] = true }
    grid
  end

  test "a door walled off from every arrival point is rejected with a reason" do
    error = assert_raises(ActiveRecord::RecordInvalid) do
      make_map(baked: {
        "entities" => [house_with_door],
        "collision" => collision([1, 0], [0, 1])
      })
    end
    assert_match(/door at \(0, 0\) is unreachable from every spawn point/, error.message)
  end

  test "a door connected to the arrival area is accepted" do
    assert make_map(baked: { "entities" => [house_with_door] })
  end

  test "a door cut off from the grid centre but reachable from an authored spawn is accepted" do
    assert make_map(baked: {
      "entities" => [house_with_door],
      "collision" => collision([2, 0], [2, 1], [0, 2], [1, 2], [2, 2]),
      "spawns" => [{ "id" => "pocket", "x" => 1, "y" => 1 }]
    })
  end
end
