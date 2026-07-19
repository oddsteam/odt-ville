class AddPoolToMonsters < ActiveRecord::Migration[8.1]
  def change
    # Which named wild-encounter pool a monster belongs to (#87, ADR-0005). An
    # authored map's `encounter` Zone names a pool and only monsters carrying
    # that name roll there, so one map can spawn different sets in different
    # zones. NULL means the monster is in today's single global pool — the
    # grandfathered behaviour, so an unfiltered `GET /monsters/pool` is
    # unchanged. Grouping, not a source: the roster is already backend-authored
    # (per-row `encounter_rate`); this only tags rows into groups. A monster in
    # two pools wants a join table — a deliberate later migration (#87 decision).
    add_column :monsters, :pool, :string
  end
end
