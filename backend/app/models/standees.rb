# The Standees domain module (ADR-0010, ADR-0015): peer-to-peer cutouts a player
# deploys onto a multiplayer map at runtime, carrying a Placard. Unlike a Prop,
# House, Zone or NPC, a Standee is not baked into the map document — it lives in
# its own `standees` table, read alongside the map. The empty table-name prefix
# keeps the module's primary table named `standees` (the same shape `Maps` uses
# for `maps`); any future standees tables carry the `standees_` prefix.
module Standees
  def self.table_name_prefix
    ""
  end
end
