module Org
  # A person on the company roster (#388, ADR-0016), whether or not they have
  # ever signed in. `Auth::User` stays the login; this is the person.
  #
  # Lowercased email is the only key, so the downcase below is not cosmetic —
  # it is what makes the unique index the identity rule.
  class Employee < ApplicationRecord
    # `Org.table_name_prefix` is "" (it keeps `companies` unprefixed), so new
    # org tables name themselves.
    self.table_name = "org_employees"

    belongs_to :company, class_name: "Org::Company"

    before_validation { self.email = email&.downcase }

    validates :email, presence: true, uniqueness: true
    validates :name, presence: true

    # No `departed` boolean anywhere: the date is the fact.
    def departed?
      left_on.present?
    end
  end
end
