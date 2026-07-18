# frozen_string_literal: true

# Tilesets — data-migration helper for renaming a bundled tileset everywhere it
# is referenced by name (issue #229). A tileset's name is its identity across
# the two persisted stores that name it: the `ground_tiles` catalog and every
# `maps.baked` document (the runtime map shape, ADR-0004). When a PNG moves into
# a category folder (tiled/README.md convention) its served name changes, so
# both stores must be rewritten together — otherwise the map's ground
# spritesheet 404s.
#
# `rename` does that rewrite in one transaction and is idempotent: re-running is
# a no-op, and names that don't match are left untouched. Data migrations call
# it (db/migrate/*), so a rename ships with the code that expects the new name —
# the homeserver runs db:prepare at boot, landing code and data together.
module Tilesets
  module_function

  # Rewrite every reference to `old_name` as `new_name` across the ground-tile
  # catalog and all baked maps, atomically. Safe to re-run: the second pass
  # finds nothing to change.
  def rename(old_name, new_name)
    ActiveRecord::Base.transaction do
      rename_ground_tiles(old_name, new_name)
      rename_baked_maps(old_name, new_name)
    end
  end

  # The catalog roster: one row per atlas cell. A plain column rename. The
  # `where` narrows to matching rows, so an already-renamed table is a no-op.
  def rename_ground_tiles(old_name, new_name)
    Catalog::GroundTile.where(tileset: old_name).update_all(tileset: new_name)
  end

  # Every baked map document. The name appears in several shapes inside `baked`
  # (see the BakedMap schema, frontend/src/kernel/schema.ts): the top-level
  # `tilesets[].name` roster, the flat `tiles[row][col].tileset` grid, each
  # `entities[].tileset`, and the optional autotiled `ground` (its own
  # `tilesets[].name` roster plus per-cell layer stacks). We rewrite in place and
  # only write back the maps that actually changed.
  def rename_baked_maps(old_name, new_name)
    Maps::Map.find_each do |map|
      baked = map.baked
      next if baked.blank?

      map.update_column(:baked, baked) if rewrite_baked!(baked, old_name, new_name)
    end
  end

  # Rewrites `baked` in place; returns true iff anything changed. Every branch is
  # evaluated (the accumulator is the right operand) so one match never
  # short-circuits the rest.
  def rewrite_baked!(baked, old_name, new_name)
    changed = rename_tileset_roster(baked["tilesets"], old_name, new_name)
    changed = rename_flat_tiles(baked["tiles"], old_name, new_name) || changed
    changed = rename_entities(baked["entities"], old_name, new_name) || changed

    ground = baked["ground"]
    if ground.is_a?(Hash)
      changed = rename_tileset_roster(ground["tilesets"], old_name, new_name) || changed
      changed = rename_ground_cells(ground["cells"], old_name, new_name) || changed
    end

    changed
  end

  # A `[{ "name" => ..., "cell" => ... }]` roster (top-level or ground).
  def rename_tileset_roster(roster, old_name, new_name)
    return false unless roster.is_a?(Array)

    changed = false
    roster.each do |ts|
      next unless ts.is_a?(Hash) && ts["name"] == old_name

      ts["name"] = new_name
      changed = true
    end
    changed
  end

  # Flat `tiles[row][col]`: each non-null cell is a `{ "tileset", "frame" }`.
  def rename_flat_tiles(tiles, old_name, new_name)
    return false unless tiles.is_a?(Array)

    changed = false
    tiles.each do |row|
      next unless row.is_a?(Array)

      row.each { |cell| changed = rename_tileset_ref(cell, old_name, new_name) || changed }
    end
    changed
  end

  # Autotiled `ground.cells[row][col]`: each cell is a *stack* of layers, each a
  # `{ "tileset", "frame", "depth" }`.
  def rename_ground_cells(cells, old_name, new_name)
    return false unless cells.is_a?(Array)

    changed = false
    cells.each do |row|
      next unless row.is_a?(Array)

      row.each do |stack|
        next unless stack.is_a?(Array)

        stack.each { |layer| changed = rename_tileset_ref(layer, old_name, new_name) || changed }
      end
    end
    changed
  end

  # `entities[]`: each may carry a legacy `tileset`+`frame` art reference.
  def rename_entities(entities, old_name, new_name)
    return false unless entities.is_a?(Array)

    changed = false
    entities.each { |e| changed = rename_tileset_ref(e, old_name, new_name) || changed }
    changed
  end

  # Rewrite a single `{ "tileset" => ... }` reference; returns true iff changed.
  def rename_tileset_ref(ref, old_name, new_name)
    return false unless ref.is_a?(Hash) && ref["tileset"] == old_name

    ref["tileset"] = new_name
    true
  end
end
