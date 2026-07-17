# The Catalog domain module (ADR-0010): the admin-managed palette of things
# that *exist* — terrains, tile objects, ground tiles, monsters. The empty
# table-name prefix keeps the pre-namespacing table names (`terrains`, not
# `catalog_terrains`); new catalog tables should carry the `catalog_` prefix
# explicitly (CONTEXT.md "Domain modules").
module Catalog
  def self.table_name_prefix
    ""
  end
end
