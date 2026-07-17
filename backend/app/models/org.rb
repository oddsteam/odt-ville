# The Org domain module (ADR-0010): the tenant root — a Company owns users and
# houses. The empty table-name prefix keeps the pre-namespacing table name
# (`companies`, not `org_companies`); new org tables (Employee/Team/Department,
# landing later) should carry the `org_` prefix explicitly (CONTEXT.md
# "Domain modules").
module Org
  def self.table_name_prefix
    ""
  end
end
