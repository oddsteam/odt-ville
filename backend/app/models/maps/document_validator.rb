module Maps
  # Save-time playability validation (#82): the deeper checks the maps
  # controller's "cheap structural rejects" comment defers here. Runs as a
  # model validation, so an unplayable document is refused at create!/update!
  # with reasons specific enough to act on (surfaced as 422 by
  # ApplicationController#render_invalid).
  module DocumentValidator
    module_function

    def reasons_for(map)
      baked = map.baked.is_a?(Hash) ? map.baked.deep_stringify_keys : {}
      source = map.source.is_a?(Hash) ? map.source.deep_stringify_keys : {}
      unknown_object_reasons(baked["entities"] || []) +
        unknown_terrain_reasons(source["terrain"]) +
        portal_reasons(map, baked["zones"] || []) +
        sight_reasons(baked["zones"] || []) +
        meeting_reasons(baked["zones"] || []) +
        unreachable_door_reasons(map, baked)
    end

    # A meeting zone (#485) names only its room. `roomId` keys the LiveKit room
    # the resolver joins (#486), so a blank one can never be joined — refuse it
    # at the boundary, the way a facing-less sight cone is refused above.
    def meeting_reasons(zones)
      zones.filter_map do |zone|
        payload = zone["payload"] || {}
        next unless payload["kind"] == "meeting"
        next if payload["roomId"].to_s.strip.present?

        "meeting zone at (#{zone['x']}, #{zone['y']}) has a blank roomId"
      end
    end

    FACINGS = %w[up down left right].freeze

    # An `on_sight` zone aims (#86), and the client schema makes `facing` part
    # of what an on_sight zone *is* — a cone without one fails to decode and
    # takes the whole map down at load. The other triggers don't aim, so this
    # only ever looks at on_sight.
    def sight_reasons(zones)
      zones.filter_map do |zone|
        next unless zone["trigger"] == "on_sight"

        at = "sight zone at (#{zone['x']}, #{zone['y']})"
        facing = zone["facing"]
        next "#{at} has no facing — a sight cone must aim somewhere" if facing.blank?
        next if FACINGS.include?(facing)

        "#{at} faces #{facing.inspect}, which is not one of #{FACINGS.join(', ')}"
      end
    end

    # Every placed door must be reachable from an arrival point — an authored
    # spawn or the grid-centre fallback (mapWalk.ts spawnTile) — under the
    # runtime's walk rule (MapScene): in bounds ∧ not collision-masked ∧ not
    # entity-solid, except a door cell overrides its entity's own solidity.
    # ADR-0002's author-time guarantee, applied at the map level.
    # ponytail: ignores entity edge_masks (border fences) — add them here if a
    # fenced-off door ever ships.
    def unreachable_door_reasons(map, baked)
      entities = baked["entities"] || []
      doors = entities.filter_map do |e|
        next if e["door_dx"].nil? || e["door_dy"].nil?

        [e["x"] + e["door_dx"], e["y"] + e["door_dy"]]
      end
      return [] if doors.empty?

      cols = map.cols.to_i
      rows = map.rows.to_i
      collision = baked["collision"] || []
      solid = Set.new
      entities.each do |e|
        (e["walk_mask"] || []).each_with_index do |row, dy|
          row.to_s.each_char.with_index do |ch, dx|
            solid << [e["x"] + dx, e["y"] + dy] if ch == "#"
          end
        end
      end
      walkable = lambda do |x, y|
        x >= 0 && y >= 0 && x < cols && y < rows &&
          collision.dig(y, x) != true &&
          (!solid.include?([x, y]) || doors.include?([x, y]))
      end

      arrivals = (baked["spawns"] || []).map { |s| [s["x"], s["y"]] } + [[cols / 2, rows / 2]]
      queue = arrivals.select { |cell| walkable.call(*cell) }.uniq
      reached = queue.to_set
      until queue.empty?
        x, y = queue.shift
        [[1, 0], [-1, 0], [0, 1], [0, -1]].each do |dx, dy|
          cell = [x + dx, y + dy]
          next if reached.include?(cell) || !walkable.call(*cell)

          reached << cell
          queue << cell
        end
      end

      doors.uniq.filter_map do |x, y|
        next if reached.include?([x, y])

        "door at (#{x}, #{y}) is unreachable from every spawn point"
      end
    end

    # The v0 town hub: dispatched by the village shell, never loaded as a Map
    # row (see PhaserGame's exit-to-town), so a portal may always target it.
    RESERVED_NODES = ["town"].freeze

    # A portal's target must be a Node that exists when the document is saved —
    # a reserved shell node, this map itself, or a saved map — and a named entry
    # spawn must exist on that target (#84, ADR-0005).
    def portal_reasons(map, zones)
      zones.filter_map do |zone|
        payload = zone["payload"] || {}
        next unless payload["kind"] == "portal"

        target = payload["targetNode"]
        next if RESERVED_NODES.include?(target)

        at = "portal at (#{zone['x']}, #{zone['y']})"
        target_map = target == map.slug ? map : Map.find_by(slug: target)
        next "#{at} targets unknown map #{target.inspect}" unless target_map

        spawn = payload["entrySpawnId"]
        next if spawn.nil? || spawn_ids(target_map).include?(spawn)

        "#{at} targets map #{target.inspect} spawn #{spawn.inspect}, which does not exist"
      end
    end

    def spawn_ids(map)
      baked = map.baked.is_a?(Hash) ? map.baked.deep_stringify_keys : {}
      (baked["spawns"] || []).filter_map { |s| s["id"] }
    end

    # A painted source's terrain names must resolve in the Tile Catalog — the
    # bake reads the catalog's stack + art, so an unknown name can never bake.
    # A Tiled-imported source has no terrain grid (ADR-0007) and skips this.
    def unknown_terrain_reasons(terrain)
      return [] unless terrain.is_a?(Array)

      names = terrain.flatten.compact.uniq
      (names - Catalog::Terrain.where(name: names).pluck(:name)).map do |name|
        "terrain #{name.inspect} is not in the catalog"
      end
    end

    # Every placed entity's `object_id` must resolve in the shared prop catalog
    # (ADR-0008) — the runtime fetches art by id, so a dangling ref renders
    # nothing at play.
    def unknown_object_reasons(entities)
      ids = entities.filter_map { |e| e["object_id"] }.uniq
      known = Catalog::TileObject.where(id: ids).pluck(:id)
      entities.filter_map do |e|
        id = e["object_id"]
        next if id.nil? || known.include?(id)

        "entity at (#{e['x']}, #{e['y']}) references unknown object #{id}"
      end
    end
  end
end
