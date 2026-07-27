module Cards
  # Who is holding which card, right now (#317). Eira is the store of record —
  # we only need a card for as long as someone is connected to look at an
  # avatar, so this is a process-local hash and there is no table to migrate.
  #
  # ponytail: process-local, so it empties on deploy and would fragment under
  # multiple Puma workers. Both are fine here — cable already assumes a single
  # process (config/cable.yml), and state self-heals on that person's next card
  # change or the next bulk read (#318). Move it to Redis alongside the cable
  # adapter when either assumption breaks.
  module Registry
    STORE = Concurrent::Map.new

    # Last write wins, and `nil` means "put the card down" — so the same event
    # twice, in any order, leaves identical state.
    def self.put(external_id, card)
      card.nil? ? STORE.delete(external_id) : STORE[external_id] = card
    end

    def self.for(external_id)
      STORE[external_id]
    end

    def self.clear
      STORE.clear
    end
  end
end
