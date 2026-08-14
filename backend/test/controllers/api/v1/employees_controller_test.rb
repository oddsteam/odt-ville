require "test_helper"

module Api
  module V1
    # GET /api/v1/org/employees (#388): the roster behind /admin/employees.
    # Admin-gated in full — unlike the catalog reads, this is 500+ colleagues'
    # names and email addresses, not a list of monsters.
    class EmployeesControllerTest < ActionDispatch::IntegrationTest
      setup do
        @company, @user = setup_company
      end

      test "returns 403 without the admin realm role" do
        get "/api/v1/org/employees", headers: auth(@user)

        assert_response :forbidden
      end

      test "an admin gets the roster, nickname and departure included" do
        ::Org::Employee.create!(company: @company, email: "b@example.test", name: "Bea Second",
                                nickname: "Bee", join_date: Date.new(2023, 1, 2))
        ::Org::Employee.create!(company: @company, email: "a@example.test", name: "Abe First",
                                nickname: "Abe", join_date: Date.new(2021, 5, 6), left_on: Date.new(2024, 2, 29))

        get "/api/v1/org/employees", headers: auth(@user, roles: %w[admin])

        assert_response :success
        assert_equal ["Abe First", "Bea Second"], json.map { _1[:name] }
        abe = json.find { _1[:email] == "a@example.test" }
        assert_equal "Abe", abe[:nickname]
        assert_equal "2021-05-06", abe[:join_date]
        assert_equal "2024-02-29", abe[:left_on]
        assert_nil json.find { _1[:email] == "b@example.test" }[:left_on]
      end

      test "each person carries their site set, name-ordered and read-only" do
        placed = ::Org::Employee.create!(company: @company, email: "p@example.test", name: "Pat Placed")
        placed.sites = [::Org::Site.create!(name: "ttb", kind: "client"),
                        ::Org::Site.create!(name: "Home", kind: "internal")]
        ::Org::Employee.create!(company: @company, email: "u@example.test", name: "Uma Unplaced")

        get "/api/v1/org/employees", headers: auth(@user, roles: %w[admin])

        assert_equal [{ name: "Home", kind: "internal" }, { name: "ttb", kind: "client" }],
                     json.find { _1[:email] == "p@example.test" }[:sites]
        assert_equal [], json.find { _1[:email] == "u@example.test" }[:sites]
      end

      # #390: the gap made visible. Not an error state — an employee with no
      # user simply has not logged in yet.
      test "each person says whether a login is linked to them" do
        signed_in = ::Org::Employee.create!(company: @company, email: "in@example.test", name: "Ida In")
        ::Org::Employee.create!(company: @company, email: "out@example.test", name: "Otto Out")
        @company.users.create!(name: "Ida", role: "branch_employee",
                               external_id: SecureRandom.uuid, email: "in@example.test").link_employee!

        get "/api/v1/org/employees", headers: auth(@user, roles: %w[admin])

        assert_equal signed_in.id, json.find { _1[:linked] }[:id]
        assert_equal [false], json.reject { _1[:linked] }.map { _1[:linked] }
      end

      # #391: the people the avatar sync's email match never reached, so the
      # manual pass has something to count. Unlinked means "no face", not "no
      # account".
      test "each person says whether a Basecamp person is linked to them" do
        faced = ::Org::Employee.create!(company: @company, email: "f@example.test", name: "Fay Faced",
                                        basecamp_person_id: 12)
        ::Org::Employee.create!(company: @company, email: "n@example.test", name: "Ned Nolink")

        get "/api/v1/org/employees", headers: auth(@user, roles: %w[admin])

        assert_equal faced.id, json.find { _1[:basecamp_linked] }[:id]
        assert_equal [false], json.reject { _1[:basecamp_linked] }.map { _1[:basecamp_linked] }
      end

      test "the roster is ordered by name" do
        %w[Zoe Ann Mia].each_with_index do |name, i|
          ::Org::Employee.create!(company: @company, email: "#{i}@example.test", name: name)
        end

        get "/api/v1/org/employees", headers: auth(@user, roles: %w[admin])

        assert_equal %w[Ann Mia Zoe], json.map { _1[:name] }
      end
    end
  end
end
