require "test_helper"

# Auth::User#link_employee! (#390, ADR-0016): the one method that closes the
# loop between a Keycloak login and the person on the roster. Both callers —
# the importer backfill and the login path — go through here, so this is where
# the rule lives: match on lowercased email, never unlink, never relink.
class UserLinkEmployeeTest < ActiveSupport::TestCase
  setup do
    @company = Org::Company.create!(name: "Co")
  end

  def user(email)
    @company.users.create!(name: "U", role: "branch_employee", external_id: SecureRandom.uuid, email: email)
  end

  def employee(email)
    Org::Employee.create!(company: @company, email: email, name: "E")
  end

  test "a matching email links the user to the employee" do
    ada = employee("ada@example.test")
    u = user("ada@example.test")

    assert_equal ada, u.link_employee!
    assert_equal ada, u.reload.employee
  end

  test "matching is case-insensitive on both sides" do
    ada = employee("Ada.Lovelace@Example.Test")
    u = user("ADA.LOVELACE@example.test")

    u.link_employee!

    assert_equal ada, u.reload.employee
  end

  test "no employee on the roster leaves the user unlinked, and does not raise" do
    u = user("contractor@example.test")

    assert_nil u.link_employee!
    assert_nil u.reload.employee
  end

  test "an already-linked user is neither unlinked nor relinked" do
    ada = employee("ada@example.test")
    u = user("ada@example.test")
    u.link_employee!
    Org::Employee.create!(company: @company, email: "later@example.test", name: "Later")
    u.update!(email: "later@example.test")

    u.link_employee!

    assert_equal ada, u.reload.employee
  end

  test "a user with no email is left alone" do
    u = @company.users.create!(name: "Local", role: "branch_employee")

    assert_nil u.link_employee!
    assert_nil u.reload.employee
  end
end
