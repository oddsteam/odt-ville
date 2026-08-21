module Org
  # A domain a Company owns (#498). A login whose email domain matches one of
  # these is Staff; every other domain is a Client (fail-closed). Data, not a
  # constant — multi-org ready, and the same table is the future
  # domain->tenant router.
  #
  # Lowercased domain is the identity, like Org::Employee's email, so the
  # downcase below is what makes the unique index the matching rule.
  class CompanyDomain < ApplicationRecord
    self.table_name = "org_company_domains"

    belongs_to :company, class_name: "Org::Company"

    before_validation { self.domain = domain&.downcase }

    validates :domain, presence: true, uniqueness: true
  end
end
