class BackfillTerrainPriority < ActiveRecord::Migration[8.1]
  # #120 persists the terrain stack, but only the fresh-seed path (db/seeds.rb)
  # fills in the full canonical order. Databases created before that seed ran —
  # every existing environment, prod included — were left with a partial
  # terrains table, so the map editor's reorder arrows had nothing to swap and
  # grass sat below its neighbours, never owning a seam. Establish the canonical
  # baseline order here, matching the seed. A migration runs exactly once, so
  # this can't clobber a later author reorder (the reorder UI isn't usable until
  # this ships anyway).
  CANONICAL = %w[water road sand dirt grass].freeze

  def up
    CANONICAL.each_with_index do |name, priority|
      execute(<<~SQL)
        INSERT INTO terrains (name, priority, created_at, updated_at)
        VALUES (#{quote(name)}, #{priority}, now(), now())
        ON CONFLICT (name) DO UPDATE SET priority = EXCLUDED.priority, updated_at = now()
      SQL
    end
  end

  def down
    # Irreversible: the pre-backfill partial state isn't worth restoring.
  end
end
