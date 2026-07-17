module Catalog
  class TileObject < ApplicationRecord
    validates :name, presence: true, uniqueness: true
    validates :kind, presence: true
    validates :image, presence: true

    # The live object of a given kind the game renders (nil if none yet).
    def self.current(kind)
      find_by(kind: kind, active: true)
    end

    # Make this the one active object of its kind. Clearing the others of the
    # same kind first keeps the per-kind single-active partial index happy; the
    # transaction makes the swap atomic.
    def activate!
      transaction do
        TileObject.where(kind: kind).where.not(id: id).update_all(active: false)
        update!(active: true)
      end
    end
  end
end
