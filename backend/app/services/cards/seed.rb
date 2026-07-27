module Cards
  # World-entry bootstrap (#318). The #317 events only carry changes going
  # forward, so anyone who picked a card up while we were down — or before they
  # joined — would show nothing. This is the one bulk read that seeds the
  # picture; events keep it live thereafter.
  module Seed
    # The Eira boundary, swappable like ApplicationController.claims_resolver —
    # it is what a test replaces to drive a canned /cards/lookup response.
    mattr_accessor :client_factory, default: -> { ::Eira::Client.from_env }

    def self.run(client: client_factory.call)
      by_email = ::Auth::User.where.not(email: [ nil, "" ]).where.not(external_id: nil)
                             .pluck(:email, :external_id).to_h
      # Only what Eira actually answered is applied: an unreachable Eira comes
      # back empty and leaves the cards live events already delivered alone,
      # rather than blanking them. A `null` in the answer is Eira saying "no
      # card", so that one does clear.
      client.lookup(by_email.keys).each do |email, card|
        external_id = by_email[email]
        Registry.put(external_id, card) if external_id
      end
    end
  end
end
