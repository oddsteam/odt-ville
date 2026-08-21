require "test_helper"

# Org::CompanyDomain (#498): a domain a Company owns, used to classify a login
# as Staff (domain matches) or Client (fail-closed). Lowercased domain is the
# identity, so the two things worth a check are that it stores lowercase and
# that it is unique.
class CompanyDomainTest < ActiveSupport::TestCase
  setup do
    @company = Org::Company.create!(name: "Co")
  end

  test "the new org table carries the org_ prefix" do
    assert_equal "org_company_domains", Org::CompanyDomain.table_name
  end

  test "domain is stored lowercased" do
    domain = @company.company_domains.create!(domain: "ODDS.Team")

    assert_equal "odds.team", domain.reload.domain
  end

  test "domain is unique across case variants" do
    @company.company_domains.create!(domain: "odds.team")

    duplicate = @company.company_domains.new(domain: "ODDS.TEAM")

    assert_not duplicate.valid?
    assert_includes duplicate.errors[:domain], "has already been taken"
  end
end
