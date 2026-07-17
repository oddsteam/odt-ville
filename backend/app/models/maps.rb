# The Maps domain module (ADR-0010): the authored-map contract — the persisted
# producer of the runtime map shape the game blits (ADR-0004/0003). The empty
# table-name prefix keeps the pre-namespacing table name (`maps`, not
# `maps_maps`); new maps tables should carry the `maps_` prefix explicitly
# (CONTEXT.md "Domain modules").
module Maps
  def self.table_name_prefix
    ""
  end
end
