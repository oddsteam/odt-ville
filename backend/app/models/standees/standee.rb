module Standees
  # A cutout of the owner's avatar, standing on a multiplayer map at the cell the
  # owner walked to, carrying the Placard's short line (#369, ADR-0015). The rig
  # is never copied — it is resolved by reference at load (`user_id →
  # users.character_manifest_id`), so changing your character restyles every
  # Standee you have out. Cross-module belongs_to targets are namespaced and
  # named explicitly (ADR-0010): the owner lives in Auth, the map in Maps.
  class Standee < ApplicationRecord
    # The expiry window an owner may set, in days (#374): the default the deploy
    # form offers, and the ceiling it refuses to go past. A Standee is time-bound
    # by construction — the message genre is a jog, a lunch, an offsite.
    DEFAULT_DAYS = 7
    MAX_DAYS = 30

    belongs_to :user, class_name: "Auth::User"
    belongs_to :map, class_name: "Maps::Map"

    # Still standing. The only sweeper there is (#374): expired rows stay in the
    # table and simply stop being loaded — no cron, no tick, no background job.
    scope :live, -> { where(expires_at: Time.current..) }

    # A Standee created without a window gets the default one, so every row is
    # time-bound whether or not the caller said anything about expiry.
    attribute :expires_at, :datetime, default: -> { DEFAULT_DAYS.days.from_now }

    validates :message, presence: true
    validates :expires_at, presence: true
    validates :cell_x, :cell_y, presence: true,
                                numericality: { only_integer: true }

    # The expiry a requested window lands on, or nil when the window is outside
    # what a Standee may have (#374) — the caller's cue to refuse the deploy
    # rather than quietly clamp it to something the owner did not ask for.
    def self.expiry_in(days)
      n = days.presence&.to_i || DEFAULT_DAYS
      n.positive? && n <= MAX_DAYS ? n.days.from_now : nil
    end

    # The rig, by reference (ADR-0015): the owner's picked-or-active manifest.
    # nil when the owner has no manifest — the client renders the bundled
    # fallback rather than crashing.
    def character_manifest_id
      user&.effective_character_manifest&.id
    end
  end
end
