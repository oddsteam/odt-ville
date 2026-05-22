class House < ApplicationRecord
  belongs_to :company
  has_many :boards, dependent: :destroy
  has_many :content_items, through: :boards

  validates :title, presence: true
  validates :category_key, presence: true

  scope :active, -> { where(active: true) }
  scope :ordered, -> { order(:position_order, :id) }
end
