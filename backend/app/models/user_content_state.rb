class UserContentState < ApplicationRecord
  # Cross-module targets are now namespaced (ADR-0010); name them explicitly
  # since Rails can't infer Auth::User / Communities::ContentItem from :user /
  # :content_item.
  belongs_to :user, class_name: "Auth::User"
  belongs_to :content_item, class_name: "Communities::ContentItem"

  enum :state, {
    unread: "unread",
    opened: "opened",
    acknowledged: "acknowledged"
  }

  validates :user_id, uniqueness: { scope: :content_item_id }
end
