class GroundTile < ApplicationRecord
  ROLES = %w[fill edge].freeze
  SIDES = %w[N E S W].freeze

  validates :tile_type, presence: true
  validates :tileset, presence: true
  validates :col, :row, :cell, presence: true
  # One catalog entry per atlas cell (matches the unique DB index).
  validates :col, uniqueness: { scope: %i[tileset row],
                                message: "cell is already tagged in this tileset" }
  validates :role, inclusion: { in: ROLES }
  # Side only applies to edge tiles (N/E/S/W); fill tiles leave it null.
  validates :side, inclusion: { in: SIDES }, allow_nil: true
end
