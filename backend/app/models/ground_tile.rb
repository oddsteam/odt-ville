class GroundTile < ApplicationRecord
  validates :tile_type, presence: true
  validates :tileset, presence: true
  validates :col, :row, :cell, presence: true
  # One catalog entry per atlas cell (matches the unique DB index).
  validates :col, uniqueness: { scope: %i[tileset row],
                                message: "cell is already tagged in this tileset" }
end
