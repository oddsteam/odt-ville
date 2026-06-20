class GroundTile < ApplicationRecord
  ROLES = %w[fill edge corner].freeze
  EDGE_SIDES = %w[N E S W].freeze          # orthogonal — for edge tiles
  CORNER_SIDES = %w[NE NW SE SW].freeze    # diagonal — for corner tiles

  validates :tile_type, presence: true
  validates :tileset, presence: true
  validates :col, :row, :cell, presence: true
  # One catalog entry per atlas cell (matches the unique DB index).
  validates :col, uniqueness: { scope: %i[tileset row],
                                message: "cell is already tagged in this tileset" }
  validates :role, inclusion: { in: ROLES }
  validate :side_matches_role

  private

  # Side is null for fill tiles, orthogonal for edges, diagonal for corners.
  def side_matches_role
    return if side.blank?

    allowed = role == "corner" ? CORNER_SIDES : EDGE_SIDES
    return if allowed.include?(side)

    errors.add(:side, "#{side} is not valid for a #{role} tile")
  end
end
