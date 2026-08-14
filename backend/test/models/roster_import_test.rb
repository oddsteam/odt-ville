require "test_helper"

# Org::RosterImport (#388, ADR-0016): the scaffolding loader that fills
# org_employees from a one-off talent.odds.team export.
#
# The real export is gitignored — 514 real names and emails, and this repo is
# public — so every test here runs against test/fixtures/files/fake_roster.json,
# a committed roster of invented people shaped exactly like the real one:
# a current person, a departed one, a multi-site one, a rehire (the same email
# twice, in two casings) and one of the test accounts that live in the real
# production roster.
class RosterImportTest < ActiveSupport::TestCase
  FIXTURE = Rails.root.join("test/fixtures/files/fake_roster.json")

  setup do
    @company = Org::Company.create!(name: "Co")
  end

  def import
    Org::RosterImport.run(path: FIXTURE, company: @company)
  end

  test "the six fixture rows become four employees" do
    report = import

    assert_equal 4, Org::Employee.count
    assert_equal({ rows: 6, skipped: 2, created: 4, updated: 0 }, report)
  end

  test "test accounts are skipped by the explicit exclusion list" do
    import

    assert_nil Org::Employee.find_by(email: "john.doe@odds.team")
    assert_equal %w[j.doe@odds.team jdai@odds.team john.doe@odds.team],
                 Org::RosterImport::EXCLUDED_EMAILS.sort
  end

  test "a rehire collapses to one employee on its active spell" do
    import

    rehired = Org::Employee.where(email: "rehired.person@example.test")
    assert_equal 1, rehired.count, "one email means one Employee"
    # The archived spell joined LATER (2023-08-01) than the active one, so this
    # only passes if active-wins beats latest-join.
    assert_equal Date.new(2020, 1, 6), rehired.first.join_date
    assert_nil rehired.first.left_on
  end

  test "departure is carried as a date" do
    import

    assert_equal Date.new(2024, 2, 29), Org::Employee.find_by(email: "departed.person@example.test").left_on
    assert_nil Org::Employee.find_by(email: "current.person@example.test").left_on
  end

  test "identity and profile are copied" do
    import

    morgan = Org::Employee.find_by(email: "multisite.person@example.test")
    assert_equal "Morgan Multisite", morgan.name
    assert_equal "Mo", morgan.nickname
    assert_equal @company, morgan.company
  end

  test "sites are upserted by name with the kind the export carries" do
    import

    assert_equal [%w[Home internal], %w[Northwind client]], Org::Site.order(:name).pluck(:name, :kind)
  end

  test "placement is a set: two sites, one, or none" do
    import

    assert_equal %w[Home Northwind], sites_of("multisite.person@example.test")
    assert_equal %w[Northwind], sites_of("current.person@example.test")
    assert_equal [], sites_of("departed.person@example.test")
  end

  test "a second run adds no duplicate sites and no duplicate placements" do
    import
    import

    assert_equal 2, Org::Site.count
    assert_equal %w[Home Northwind], sites_of("multisite.person@example.test")
  end

  test "a site dropped upstream disappears: the set is replaced, not merged" do
    import
    assert_equal %w[Home Northwind], sites_of("multisite.person@example.test")

    Org::RosterImport.run(path: without_home, company: @company)

    assert_equal %w[Northwind], sites_of("multisite.person@example.test")
  end

  test "a second run changes nothing and reports it" do
    import
    before = Org::Employee.order(:email).pluck(:email, :name, :nickname, :join_date, :left_on)

    report = import

    assert_equal before, Org::Employee.order(:email).pluck(:email, :name, :nickname, :join_date, :left_on)
    assert_equal({ rows: 6, skipped: 2, created: 0, updated: 4 }, report)
  end

  test "a departed row with no date is refused rather than read as current" do
    broken = Tempfile.new(["roster", ".json"])
    broken.write([{ "email" => "no.date@example.test", "name" => "N D", "departed" => true, "left_on" => nil }].to_json)
    broken.flush

    assert_raises(Org::RosterImport::MissingDeparture) do
      Org::RosterImport.run(path: broken.path, company: @company)
    end
  end

  private

  def sites_of(email)
    Org::Employee.find_by(email: email).sites.order(:name).pluck(:name)
  end

  # The fixture with Morgan's internal placement removed — an upstream removal.
  def without_home
    rows = JSON.parse(File.read(FIXTURE))
    rows.each { _1["sites"] = _1["sites"].reject { |s| s["name"] == "Home" } }
    trimmed = Tempfile.new(["roster", ".json"])
    trimmed.write(rows.to_json)
    trimmed.flush
    trimmed.path
  end
end
