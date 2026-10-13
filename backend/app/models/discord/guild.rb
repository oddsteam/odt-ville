# A Discord server (guild) that runs the Activity, and the one map it renders
# (#569, plan decision 2). Keyed by Discord's guild id string.
module Discord
  class Guild < ApplicationRecord
    belongs_to :map, class_name: "Maps::Map"

    validates :guild_id, presence: true, uniqueness: true
  end
end
