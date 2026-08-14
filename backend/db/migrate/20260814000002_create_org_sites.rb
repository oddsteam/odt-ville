# Client engagements and the placement of employees onto them (#389, ADR-0016).
#
# `name` is the key. Upstream site ids are deliberately not imported for the
# same reason org_employees carries no source_id: talent.odds.team is temporary
# scaffolding and its successor will not reissue those ids.
class CreateOrgSites < ActiveRecord::Migration[8.1]
  def change
    create_table :org_sites do |t|
      t.string :name, null: false, index: { unique: true }
      # `client` or `internal`. Read from the export, never re-derived from the
      # name — upstream's trailing asterisk (`Home*`) is stripped before it
      # reaches us, so the character is not a fact this table can rely on.
      t.string :kind, null: false

      t.timestamps
    end

    # Placement is genuinely many-to-many (nine people are split across two
    # clients), so it can never collapse into a column on org_employees.
    #
    # No id and no timestamps: the set is unordered and there is no primary
    # site until a feature needs one, which leaves the pair itself as the whole
    # row — and the unique index as the rule that says so.
    create_table :org_employee_sites, id: false do |t|
      t.bigint :employee_id, null: false
      t.bigint :site_id, null: false

      t.index %i[employee_id site_id], unique: true
    end
  end
end
