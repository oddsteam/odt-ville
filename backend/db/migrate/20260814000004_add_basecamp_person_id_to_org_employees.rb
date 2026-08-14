# The link from a person on the roster to their Basecamp account (#391,
# ADR-0012). Email equality was the join and it is the bug: some people's
# Basecamp address is not their org address, so they never matched and
# permanently rendered the fallback face.
#
# ADR-0016's "no upstream source_id" rule does not apply: this is not the
# roster's own id, it is a link to a system we own the integration with.
class AddBasecampPersonIdToOrgEmployees < ActiveRecord::Migration[8.1]
  def change
    # Nullable forever — most people have no link until email matches them or a
    # human sets one, and unlinked is a normal state, not an error.
    add_column :org_employees, :basecamp_person_id, :bigint
    add_index :org_employees, :basecamp_person_id
  end
end
