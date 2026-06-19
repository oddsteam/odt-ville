class CharacterManifest < ApplicationRecord
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
