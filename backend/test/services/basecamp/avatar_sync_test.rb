require "test_helper"

module Basecamp
  class AvatarSyncTest < ActiveSupport::TestCase
    setup do
      @company = Org::Company.create!(name: "ODT")
    end

    # Basecamp stubbed at the HTTP boundary, same stub transport as ClientTest:
    # the first response is the token mint, the rest are pages of people.json.
    def sync_against(*pages)
      calls = []
      responses = [ [ 200, { "access_token" => "at-1" } ] ] + pages.map { |p| [ 200, p ] }
      transport = ->(method, url, headers) {
        calls << { method:, url:, headers: }
        responses[calls.size - 1] || [ 200, [] ]
      }
      client = Client.new(client_id: "cid", client_secret: "shh", refresh_token: "r",
                          account_id: "999", http: transport)
      [ AvatarSync.new(client: client), calls ]
    end

    def user(name:, email:)
      @company.users.create!(name: name, email: email, external_id: SecureRandom.uuid)
    end

    test "copies each person's avatar onto the user with the same email, across pages" do
      alice = user(name: "Alice", email: "alice@odds.team")
      bob = user(name: "Bob", email: "bob@odds.team")
      sync, calls = sync_against(
        [ { "email_address" => "Alice@Odds.Team", "avatar_url" => "https://bc.test/alice.png" } ],
        [ { "email_address" => "bob@odds.team", "avatar_url" => "https://bc.test/bob.png" } ]
      )

      assert_equal 2, sync.call[:updated]

      assert_equal "https://bc.test/alice.png", alice.reload.avatar_url
      assert_equal "https://bc.test/bob.png", bob.reload.avatar_url
      assert_equal 4, calls.size, "the empty page that ends pagination is still a request"
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
  end
end
