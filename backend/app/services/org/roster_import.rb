module Org
  # Loads the org roster from a one-off talent.odds.team export (#388, ADR-0016).
  #
  # Scaffolding by design: a rake task reading a gitignored JSON file, not a
  # client and not a cron. talent issues no service credential and this repo is
  # public, so 514 real names may never enter git. The tables are the durable
  # part; this loader is expected to be deleted when the message-queue consumer
  # lands.
  #
  # Idempotent by construction — lowercased email is the key, so a second run
  # finds every row again and rewrites the same values.
  class RosterImport
    # Departure is a fact on the row (ADR-0016), and `left_on.present?` is the
    # only way the model can express it. A departed row with no date would
    # silently import as *current*, so it stops the run instead.
    MissingDeparture = Class.new(StandardError)

    # The production roster carries seven test-account rows. Explicit list, not
    # a clever heuristic, so the rule is visible and reviewable.
    EXCLUDED_EMAILS = %w[john.doe@odds.team j.doe@odds.team jdai@odds.team].freeze

    DEFAULT_PATH = Rails.root.join("db/talent_employees.json")

    def self.run(path: DEFAULT_PATH, company: Org::Company.first!)
      new(path: path, company: company).call
    end

    def initialize(path:, company:)
      @path = path
      @company = company
    end

    # Returns { rows:, skipped:, created:, updated: }. `rows` is what the export
    # held; `skipped` is every row that produced no Employee — a test account or
    # a rehire's losing spell — so the four numbers balance.
    def call
      rows = JSON.parse(File.read(@path))
      people = rows
        .reject { EXCLUDED_EMAILS.include?(_1["email"].downcase) }
        .group_by { _1["email"].downcase }
        .transform_values { spell(_1) }
      created = people.count { |email, row| upsert(email, row) }

      { rows: rows.size, skipped: rows.size - people.size, created: created, updated: people.size - created }
    end

    private

    # One email means one Employee, so rehires collapse: presence in the active
    # list wins outright, and only then does the latest join_date break the tie.
    def spell(rows)
      current = rows.reject { _1["departed"] }
      (current.presence || rows).max_by { _1["join_date"].to_s }
    end

    # True when the row created an Employee rather than refreshing one.
    def upsert(email, row)
      raise MissingDeparture, email if row["departed"] && row["left_on"].blank?

      employee = Employee.find_or_initialize_by(email: email)
      new_record = employee.new_record?
      employee.update!(
        company: @company,
        name: row["name"],
        nickname: row["nickname"],
        join_date: row["join_date"],
        left_on: row["left_on"]
      )
      new_record
    end
  end
end
