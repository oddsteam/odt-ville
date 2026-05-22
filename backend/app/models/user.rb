class User < ApplicationRecord
  belongs_to :company
  has_many :user_content_states, dependent: :destroy
  has_one :user_location_state, dependent: :destroy

  validates :name, presence: true

  # The location row is a per-user singleton. Create it lazily so a brand-new
  # user is treated as a first-time visitor (spawns at Town Entrance).
  def location_state
    user_location_state || create_user_location_state!(company: company, last_area: "town")
  end
end
