module Character
  class CharacterManifest < ApplicationRecord
    # nil owner = house-owned (the shared roster); a set owner is a personal
    # Look kept out of it (#394).
    belongs_to :owner, class_name: "Auth::User", optional: true

    scope :house_owned, -> { where(owner_id: nil) }

    validates :name, presence: true, uniqueness: true

    # The single live character the game/preview loads (nil if none saved yet).
    def self.current
      find_by(active: true)
    end

    # Make this row the one active manifest. Clearing the others first keeps the
    # single-active partial unique index happy; the transaction makes the swap
    # atomic.
    def activate!
      transaction do
        CharacterManifest.where.not(id: id).update_all(active: false)
        update!(active: true)
      end
    end
  end
end
