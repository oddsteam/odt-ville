class ContentItem < ApplicationRecord
  belongs_to :board
  has_one :house, through: :board
  has_many :user_content_states, dependent: :destroy

  enum :priority, {
    normal: "normal",
    important: "important",
    urgent: "urgent"
  }

  validates :title, presence: true

  scope :active, -> { where(active: true) }

  # Items that are currently live: active and within their effective window.
  # A nil bound means "open-ended" on that side.
  scope :effective, ->(at = Time.current) {
    active
      .where("effective_from IS NULL OR effective_from <= ?", at)
      .where("expires_at IS NULL OR expires_at >= ?", at)
  }

  # Ruby-side equivalent of the `effective` scope, for use on preloaded records
  # (avoids extra queries when content_items are already loaded).
  def effective?(at = Time.current)
    active &&
      (effective_from.nil? || effective_from <= at) &&
      (expires_at.nil? || expires_at >= at)
  end
end
