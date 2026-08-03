module Standees
  # A cutout of the owner's avatar, standing on a multiplayer map at the cell the
  # owner walked to, carrying the Placard's short line (#369, ADR-0015). The rig
  # is never copied — it is resolved by reference at load (`user_id →
  # users.character_manifest_id`), so changing your character restyles every
  # Standee you have out. Cross-module belongs_to targets are namespaced and
  # named explicitly (ADR-0010): the owner lives in Auth, the map in Maps.
  class Standee < ApplicationRecord
    belongs_to :user, class_name: "Auth::User"
    belongs_to :map, class_name: "Maps::Map"

    validates :message, presence: true
    validates :cell_x, :cell_y, presence: true,
                                numericality: { only_integer: true }

    # The rig, by reference (ADR-0015): the owner's picked-or-active manifest.
    # nil when the owner has no manifest — the client renders the bundled
    # fallback rather than crashing.
    def character_manifest_id
      user&.effective_character_manifest&.id
    end
  end
end
