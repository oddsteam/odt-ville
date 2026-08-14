module Org
  # A client engagement an Employee is placed at (#389, CONTEXT.md "Site") —
  # `ttb`, `KTC`, `TISCO`. Not a physical office and not a team.
  class Site < ApplicationRecord
    self.table_name = "org_sites"

    has_and_belongs_to_many :employees, class_name: "Org::Employee", join_table: :org_employee_sites

    validates :name, presence: true, uniqueness: true
    validates :kind, inclusion: { in: %w[client internal] }
  end
end
