require "test_helper"

module Cards
  # World-entry bootstrap (#318): one bulk read of Eira's board, joined onto
  # local users by email, so a card picked up while everyone was offline is on
  # the avatar the moment someone arrives.
  class SeedTest < ActiveSupport::TestCase
    include ApiTestHelpers

    setup { @company, = setup_company }
    teardown { Registry.clear }

    CARD = { "title" => "Wire up the pathfinder", "status" => "DOING",
             "url" => "https://jira/browse/ONEREV-1" }.freeze

    def user(email:, name: "Someone")
      @company.users.create!(name: name, email: email, external_id: SecureRandom.uuid,
                             role: "branch_employee")
    end

    # A stub Eira, standing in for the client at the /cards/lookup boundary.
    def stub_eira(cards)
      asked = []
      client = Struct.new(:cards).new(cards)
      client.define_singleton_method(:lookup) { |emails| asked.concat(emails); cards }
      [ client, asked ]
    end

    test "seeds the registry with every card Eira is holding" do
      holder = user(email: "a@odds.team")
      client, asked = stub_eira("a@odds.team" => CARD)

      Seed.run(client: client)

      assert_equal [ "a@odds.team" ], asked
      assert_equal CARD, Registry.for(holder.external_id)
    end

    # `null` is "no card" — a seeded absence, never an error and never a gap.
    test "someone Eira returns null for holds no card" do
      idle = user(email: "b@odds.team")
      Registry.put(idle.external_id, CARD)
      client, = stub_eira("b@odds.team" => nil)

      Seed.run(client: client)

      assert_nil Registry.for(idle.external_id)
    end

    # Degrading to blank badges means "seed nothing", not "wipe what the live
    # events already delivered" — an Eira that is down at entry must not take
    # the cards we can already see with it.
    test "an unreachable Eira leaves the cards events already delivered alone" do
      holder = user(email: "a@odds.team")
      Registry.put(holder.external_id, CARD)
      client, = stub_eira({})

      Seed.run(client: client)

      assert_equal CARD, Registry.for(holder.external_id)
    end

    # A user with no email can't be joined to Eira's board, and asking about a
    # blank address would waste a slot in the 500 budget.
    test "users without an email are not asked about" do
      user(email: nil)
      client, asked = stub_eira({})

      Seed.run(client: client)

      assert_empty asked
    end
  end
end
