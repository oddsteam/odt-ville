class AddCompositionToTileObjects < ActiveRecord::Migration[8.1]
  def change
    # Editor-only rebuild note (#355, ADR-0014): which tileset, which tile index,
    # which cell, which layer made this object's flattened art. Read only by the
    # tile-object mapper so a composed object can be reopened and remixed rather
    # than rebuilt from scratch. The game never reads it — the flat PNG in `image`
    # stays truth. jsonb like maps.baked / content_items.data; {} = no composition
    # (every object composed before this, plus the upload path), which edits as a
    # flat crop exactly as today. Not backfillable: earlier objects stay {}.
    add_column :tile_objects, :composition, :jsonb, default: {}, null: false
  end
end
