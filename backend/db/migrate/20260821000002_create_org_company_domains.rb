# Company email domains (#498): the domains a Company owns, used to classify a
# login as Staff (domain matches) or Client (no match, fail-closed). Data, not a
# hardcoded constant — multi-org ready, and the future domain->tenant router.
# FK-less by the soft-seam rule; the org module keys company by id but adds no
# hard FK (mirrors org_employees).
class CreateOrgCompanyDomains < ActiveRecord::Migration[8.1]
  def change
    create_table :org_company_domains do |t|
      t.bigint :company_id, null: false
      t.string :domain, null: false
      t.timestamps
    end
    add_index :org_company_domains, :company_id
    add_index :org_company_domains, :domain, unique: true
  end
end
