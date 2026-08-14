require "test_helper"

module Basecamp
  class AvatarSyncTest < ActiveSupport::TestCase
    setup do
      @company = Org::Company.create!(name: "ODT")
    end

    # Basecamp stubbed at the HTTP boundary, same stub transport as ClientTest:
    # the token mint, then the roster. Paging is the client's job and is covered
    # in its own test (#326), so the roster arrives here as one page.
    def sync_against(roster)
      calls = []
      responses = [ [ 200, { "access_token" => "at-1" } ], [ 200, roster ] ]
      transport = ->(method, url, headers) {
        calls << { method:, url:, headers: }
        responses[calls.size - 1] || [ 200, [] ]
      }
      client = Client.new(client_id: "cid", client_secret: "shh", refresh_token: "r",
                          account_id: "999", http: transport)
      [ AvatarSync.new(client: client), calls ]
    end

    def user(name:, email:, employee: nil)
      @company.users.create!(name: name, email: email, external_id: SecureRandom.uuid, employee: employee)
    end

    def employee(name:, email:, basecamp_person_id: nil)
      Org::Employee.create!(company: @company, name: name, email: email,
                            basecamp_person_id: basecamp_person_id)
    end

    # Basecamp stores whatever casing the person typed, so the join lowercases.
    test "copies each person's avatar onto the user with the same email" do
      alice = user(name: "Alice", email: "alice@odds.team")
      bob = user(name: "Bob", email: "bob@odds.team")
      sync, calls = sync_against([
        { "email_address" => "Alice@Odds.Team", "avatar_url" => "https://bc.test/alice.png" },
        { "email_address" => "bob@odds.team", "avatar_url" => "https://bc.test/bob.png" }
      ])

      assert_equal 2, sync.call[:updated]

      assert_equal "https://bc.test/alice.png", alice.reload.avatar_url
      assert_equal "https://bc.test/bob.png", bob.reload.avatar_url
      assert_equal "ODT Ville (zacrify1986@gmail.com)", calls.last[:headers]["User-Agent"]
    end

    test "re-running writes nothing when nobody's avatar changed" do
      alice = user(name: "Alice", email: "alice@odds.team")
      person = [ { "email_address" => "alice@odds.team", "avatar_url" => "https://bc.test/alice.png" } ]
      sync_against(person).first.call
      before = alice.reload.updated_at

      assert_equal 0, sync_against(person).first.call[:updated]
      assert_equal before, alice.reload.updated_at
    end

    test "a rotated avatar url overwrites the stored one" do
      alice = user(name: "Alice", email: "alice@odds.team")
      alice.update!(avatar_url: "https://bc.test/alice-old.png")

      sync_against([ { "email_address" => "alice@odds.team", "avatar_url" => "https://bc.test/alice-new.png" } ]).first.call

      assert_equal "https://bc.test/alice-new.png", alice.reload.avatar_url
    end

    test "people with no local match and users with no email are left alone" do
      emailless = @company.users.create!(name: "Nobody", external_id: SecureRandom.uuid)
      sync, = sync_against([
        { "email_address" => "stranger@example.com", "avatar_url" => "https://bc.test/stranger.png" },
        { "email_address" => nil, "avatar_url" => "https://bc.test/ghost.png" }
      ])

      assert_equal({ people: 2, updated: 0 }, sync.call)
      assert_nil emailless.reload.avatar_url
    end

    # The email match is what fills the link (#391): every person Basecamp and
    # the roster agree on is linked by id from then on, so the manual pass in
    # the follow-up only has to cover the ones email can't reach.
    test "an email match records the Basecamp person id on the employee" do
      alice = employee(name: "Alice", email: "alice@odds.team")

      sync_against([ { "id" => 7, "email_address" => "Alice@Odds.Team", "avatar_url" => "https://bc.test/a.png" } ]).first.call

      assert_equal 7, alice.reload.basecamp_person_id
    end

    # The point of the link: Basecamp's address for this person is not their
    # org address, so email can never join them — the id does.
    test "an employee linked by id gets the avatar though the emails differ" do
      carol = employee(name: "Carol", email: "carol@odds.team", basecamp_person_id: 42)
      login = user(name: "Carol", email: "carol@odds.team", employee: carol)

      sync_against([ { "id" => 42, "email_address" => "carol@personal.test", "avatar_url" => "https://bc.test/c.png" } ]).first.call

      assert_equal "https://bc.test/c.png", login.reload.avatar_url
    end

    # Nobody who has a face today loses one: a login with no employee row still
    # joins on email, exactly as before.
    test "an employee Basecamp doesn't know stays unlinked while email matches still land" do
      stranger = employee(name: "Stranger", email: "stranger@odds.team")
      bob = user(name: "Bob", email: "bob@odds.team")

      sync_against([ { "id" => 8, "email_address" => "bob@odds.team", "avatar_url" => "https://bc.test/b.png" } ]).first.call

      assert_nil stranger.reload.basecamp_person_id
      assert_equal "https://bc.test/b.png", bob.reload.avatar_url
    end
  end
end
