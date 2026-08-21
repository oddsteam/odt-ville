module Org
  class Company < ApplicationRecord
    # Cross-module associations (ADR-0010 governs code organization, not AR
    # relations): a Company owns Auth::User and Communities::House rows.
    has_many :users, dependent: :destroy, class_name: "Auth::User"
    has_many :houses, dependent: :destroy, class_name: "Communities::House"
    # The domains this company owns (#498) — a login's email domain matching one
    # proves Staff; no match is a Client (fail-closed).
    has_many :company_domains, dependent: :destroy, class_name: "Org::CompanyDomain"

    validates :name, presence: true
  end
end
