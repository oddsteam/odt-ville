class RenameFootpathTileset < ActiveRecord::Migration[8.1]
  # PR #228 moved footpath_32x32.png into the terrain/ category folder
  # (tiled/README.md convention), but the `downtown` map's baked document still
  # names the flat `footpath_32x32` tileset — so its ground spritesheet 404s.
  # Rename it everywhere it is persisted (ground_tiles + every baked map) to
  # match the served path. Idempotent via Tilesets.rename; re-running is a
  # no-op, and non-matching names (e.g. VerifyEditor) are untouched. (#229)
  #
  # Local dev applies this in-container:
  #   docker compose exec backend ./bin/rails db:migrate
  #   docker compose restart backend
  # The homeserver runs db:prepare at boot, so a normal deploy lands it.
  def up
    Tilesets.rename("footpath_32x32", "terrain/footpath_32x32")
  end

  def down
    Tilesets.rename("terrain/footpath_32x32", "footpath_32x32")
  end
end
