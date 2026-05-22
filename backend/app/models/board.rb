class Board < ApplicationRecord
  belongs_to :house
  has_many :content_items, dependent: :destroy

  enum :board_type, {
    must_know: "must_know",
    should_know: "should_know",
    nice_to_know: "nice_to_know"
  }

  validates :board_type, presence: true
  validates :board_type, uniqueness: { scope: :house_id }
end
