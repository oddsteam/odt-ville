module Communities
  class House < ApplicationRecord
    # Cross-module: a House belongs to an Org::Company (ADR-0010). Boards and
    # content items are same-module, so Rails infers Communities::Board etc.
    belongs_to :company, class_name: "Org::Company"
    # The assigned mapped building for this house's hometown plot (#292).
    # Null falls back to the active 'building' object, then bundled art.
    belongs_to :tile_object, class_name: "Catalog::TileObject", optional: true
    has_many :boards, dependent: :destroy
    has_many :content_items, through: :boards

    validates :title, presence: true
    validates :category_key, presence: true
    validate :tile_object_is_a_building

    scope :active, -> { where(active: true) }
    scope :ordered, -> { order(:position_order, :id) }
    # The hometown read is scoped to the caller's effective sites plus downtown
    # (#497): a `site: nil` community is downtown-scoped and shows to everyone at
    # this stage; a `site: "KTB"` community shows only to a user placed at KTB.
    # FK-less, keyed by site *name* per the soft-seam rule.
    scope :for_sites, ->(names) { where(site: [nil, *names]) }

    private

    def tile_object_is_a_building
      return if tile_object.nil? || tile_object.kind == "building"

      errors.add(:tile_object, "must be a 'building' object")
    end
  end
end
