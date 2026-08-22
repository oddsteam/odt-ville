class SeedCompanyStaffDomains < ActiveRecord::Migration[8.1]
  # Staff/Client classification (#498) proves staff by matching the login email
  # domain against org_company_domains. Those rows were only ever inserted by
  # db/seeds.rb, which never runs in prod — so prod's table was empty and every
  # staff login classified as Client (external=true), gating them from downtown
  # buildings and emptying the hometown (#509). Seed the domains here so a
  # deploy lands them: the homeserver runs db:prepare at boot, but never seeds.
  #
  # Idempotent via find_or_create_by!; re-running (and running after the manual
  # prod hotfix) is a no-op. Attaches to the sole Company; a company-less DB
  # (a fresh install before seeding) is skipped rather than inventing one.
  #
  # Local dev applies this in-container:
  #   docker compose exec backend ./bin/rails db:migrate
  #   docker compose restart backend
  STAFF_DOMAINS = %w[odds.team odt.co.th].freeze

  def up
    company = Org::Company.first
    return unless company

    STAFF_DOMAINS.each { |d| company.company_domains.find_or_create_by!(domain: d) }
  end

  def down
    Org::CompanyDomain.where(domain: STAFF_DOMAINS).delete_all
  end
end
