class UserContentState < ApplicationRecord
  belongs_to :user
  belongs_to :content_item

  enum :state, {
    unread: "unread",
    opened: "opened",
    acknowledged: "acknowledged"
  }

  validates :user_id, uniqueness: { scope: :content_item_id }
end
