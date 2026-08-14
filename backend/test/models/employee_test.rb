require "test_helper"

# Org::Employee (#388, ADR-0016): a person on the company roster, whether or not
# they have ever logged in. Lowercased email is the ONLY key — upstream record
# ids are read past and discarded — so the two things worth a check here are
# that the column stores lowercase and that it is unique.
class EmployeeTest < ActiveSupport::TestCase
  setup do
    @company = Org::Company.create!(name: "Co")
  end

  test "the new org table carries the org_ prefix" do
    assert_equal "org_employees", Org::Employee.table_name
  end

  test "email is stored lowercased" do
    employee = Org::Employee.create!(company: @company, email: "Ada.Lovelace@Example.Test", name: "Ada")

    assert_equal "ada.lovelace@example.test", employee.reload.email
  end

  test "email is unique across case variants" do
    Org::Employee.create!(company: @company, email: "ada@example.test", name: "Ada")

    duplicate = Org::Employee.new(company: @company, email: "ADA@example.test", name: "Ada Again")

    assert_not duplicate.valid?
    assert_includes duplicate.errors[:email], "has already been taken"
  end

  test "departure is a date, not a flag" do
    assert_not Org::Employee.new(left_on: nil).departed?
    assert Org::Employee.new(left_on: Date.new(2026, 7, 4)).departed?
  end
end
