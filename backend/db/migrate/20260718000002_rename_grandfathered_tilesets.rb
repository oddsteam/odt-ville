class RenameGrandfatheredTilesets < ActiveRecord::Migration[8.1]
  # The six tilesets that sat flat at the top of public/maps/tilesets/ move into
  # category folders (tiled/README.md convention, #230). Their PNGs shift, so the
  # served name changes — and their names are persisted in `ground_tiles` and in
  # baked map documents (atrium, jua-dungeon, test01, test02, new-test). Rename
  # each everywhere it is stored so the ground spritesheet keeps resolving.
  #
  # Idempotent via Tilesets.rename; re-running is a no-op, and non-matching names
  # (e.g. the 16x16 authoring variant, or VerifyEditor) are untouched. (#230)
  #
  # Local dev applies this in-container:
  #   docker compose exec backend ./bin/rails db:migrate
  #   docker compose restart backend
  # The homeserver runs db:prepare at boot, so a normal deploy lands it.
  RENAMES = {
    "1_Terrains_and_Fences_32x32" => "terrain/1_Terrains_and_Fences_32x32",
    "2_City_Terrains_32x32" => "terrain/2_City_Terrains_32x32",
    "4_Generic_Buildings_32x32" => "buildings/4_Generic_Buildings_32x32",
    "5_Floor_Modular_Buildings_32x32" => "buildings/5_Floor_Modular_Buildings_32x32",
    "Interiors_free_32x32" => "interiors/Interiors_free_32x32",
    "10_Vehicles_32x32" => "vehicles/10_Vehicles_32x32",
  }.freeze

  def up
    RENAMES.each { |old_name, new_name| Tilesets.rename(old_name, new_name) }
  end

  def down
    RENAMES.each { |old_name, new_name| Tilesets.rename(new_name, old_name) }
  end
end
