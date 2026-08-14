# The org roster's first real table (#388, ADR-0016): a person who exists
# whether or not they have ever logged in, so people can be assigned to things
# before first login — which a Keycloak-provisioned `users` row cannot express.
#
# Lowercased email is the ONLY key. There is deliberately no `source_id`:
# talent.odds.team is temporary scaffolding and the directory service that
# replaces it will not reissue its ids, so the unique index below is the seam
# the swap happens on.
class CreateOrgEmployees < ActiveRecord::Migration[8.1]
  def change
    create_table :org_employees do |t|
      # The tenant. A plain bigint, not `t.references` — ADR-0010 keeps the
      # game<->org seam soft, and script/schema-lint.sh allowlists FKs one by
      # one; this table needs none of that to answer "which company".
      t.bigint :company_id, null: false, index: true

      # The one identifier every upstream source carries, and the join key
      # Auth::User provisioning and Basecamp::AvatarSync (ADR-0012) already use.
      t.string :email, null: false, index: { unique: true }

      # Legal name and what the person is actually called. Nickname is the label
      # the village should prefer (CONTEXT.md "Nickname"); name is the fallback.
      t.string :name, null: false
      t.string :nickname

      t.date :join_date
      # Departure is a fact on the row, not a flag: `left_on.present?` is the
      # whole answer, and the importer guarantees a departed person has a date
      # (resignation_date falling back to archived_at upstream).
      t.date :left_on

      t.timestamps
    end
  end
end
