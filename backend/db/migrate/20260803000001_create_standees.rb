# Standees (#369, ADR-0015): a peer-to-peer cutout a player deploys onto a
# multiplayer map at runtime, carrying a one-line Placard. Unlike every other
# placed entity (prop/house/zone/npc) a Standee is NOT baked into the map
# document — it is its own table, read alongside the map (ADR-0015). This is the
# tracer slice: owner, map, cell, and the Placard's short line. Expiry, budget,
# reply link and detail body are later slices (#370–#373).
class CreateStandees < ActiveRecord::Migration[8.1]
  def change
    create_table :standees do |t|
      # The owner and the map it stands on. Both cascade: a Standee dies with its
      # owner and with its map, never orphaned (ADR-0015) — a departed employee
      # is not left standing in the plaza. These are the two deliberate hard FKs
      # this table carries (allowlisted in script/schema-lint.sh in the same PR).
      t.references :user, null: false, foreign_key: { on_delete: :cascade }
      t.references :map, null: false, foreign_key: { on_delete: :cascade }
      # The cell the owner chose by walking there — a tile coordinate, not pixels.
      t.integer :cell_x, null: false
      t.integer :cell_y, null: false
      # The Placard's short line, shown over the cutout's head.
      t.string :message, null: false

      t.timestamps
    end
  end
end
