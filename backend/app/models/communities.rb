# The Communities domain module (ADR-0010): the reusable content surface —
# Houses, their Boards and ContentItems — with no spatial / game concepts. The
# empty table-name prefix keeps the pre-namespacing table names (`houses`, not
# `communities_houses`); new communities tables should carry the `communities_`
# prefix explicitly (CONTEXT.md "Domain modules").
module Communities
  def self.table_name_prefix
    ""
  end
end
