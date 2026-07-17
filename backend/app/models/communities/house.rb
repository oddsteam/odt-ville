module Communities
  class House < ApplicationRecord
    # Cross-module: a House belongs to an Org::Company (ADR-0010). Boards and
    # content items are same-module, so Rails infers Communities::Board etc.
    belongs_to :company, class_name: "Org::Company"
    has_many :boards, dependent: :destroy
    has_many :content_items, through: :boards

    validates :title, presence: true
    validates :category_key, presence: true

    scope :active, -> { where(active: true) }
    scope :ordered, -> { order(:position_order, :id) }
  end
end
