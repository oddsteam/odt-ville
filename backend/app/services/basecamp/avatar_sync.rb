module Basecamp
  # Copies Basecamp's roster avatars onto local users, joined by email
  # (issue #321, ADR-0012). Basecamp's account is the roster of record; the
  # signed URL it hands back is stored server-side only and served through our
  # own proxy path.
  #
  # Idempotent by construction: last sync wins, a person whose avatar hasn't
  # rotated is not written, and anyone Basecamp doesn't know — or who has no
  # email to join on — keeps the #320 fallback.
  class AvatarSync
    def self.run(client: Client.from_env)
      new(client: client).call
    end

    def initialize(client:)
      @client = client
    end

    # Returns { people:, updated: } so a run says what it saw and what it moved.
    # The client hands back the whole roster, pages already walked (#326).
    def call
      roster = @client.get("people.json")
      updated = roster.count { |person| apply(person) }
      { people: roster.size, updated: updated }
    end

    private

    def apply(person)
      user = user_for(person["email_address"])
      return false if user.nil? || user.avatar_url == person["avatar_url"]

      user.update!(avatar_url: person["avatar_url"])
    end

    # users.email is unique, but Basecamp's casing is whatever the person typed.
    def user_for(email)
      return nil if email.blank?

      ::Auth::User.find_by("lower(email) = ?", email.downcase)
    end
  end
end
