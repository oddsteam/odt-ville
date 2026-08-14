module Basecamp
  # Copies Basecamp's roster avatars onto local users (issue #321, ADR-0012),
  # resolved through the org roster: Basecamp person -> Org::Employee -> its
  # login, falling back to a direct email match on the login. Basecamp's
  # account is the roster of record; the signed URL it hands back is stored
  # server-side only and served through our own proxy path.
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
      employee = employee_for(person)
      employee&.update!(basecamp_person_id: person["id"])

      user = employee&.user || user_for(person["email_address"])
      return false if user.nil? || user.avatar_url == person["avatar_url"]

      user.update!(avatar_url: person["avatar_url"])
    end

    # The roster person, by the link first (#391) and by email only to fill it
    # in. So a link a human set by hand — the whole point, for people whose
    # Basecamp address is not their org address — outlives the email mismatch.
    # Never by name: normalized name equality aligns ~50 of 514 people, and a
    # wrong face is worse than no face.
    def employee_for(person)
      by_id = person["id"] && ::Org::Employee.find_by(basecamp_person_id: person["id"])
      by_id || employee_by_email(person["email_address"])
    end

    def employee_by_email(email)
      email.present? && ::Org::Employee.find_by(email: email.downcase) || nil
    end

    # users.email is unique, but Basecamp's casing is whatever the person typed.
    def user_for(email)
      return nil if email.blank?

      ::Auth::User.find_by("lower(email) = ?", email.downcase)
    end
  end
end
