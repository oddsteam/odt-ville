module Character
  class CharacterManifest < ApplicationRecord
    # nil owner = house-owned (the shared roster); a set owner is a personal
    # Look kept out of it (#394).
    belongs_to :owner, class_name: "Auth::User", optional: true

    scope :house_owned, -> { where(owner_id: nil) }

    # A personal Look holds at most three per owner (ADR-0017).
    MAX_LOOKS = 3
    # Part slot z-order and cardinality: body/eyes required, outfit/hairstyle
    # optional, accessory up to two (CONTEXT.md → Part slot). Slot is the part
    # name's prefix (body-01, accessory-03-07) — no parts table (ADR-0007).
    SLOT_MAX = { "body" => 1, "eyes" => 1, "outfit" => 1, "hairstyle" => 1, "accessory" => 2 }.freeze
    REQUIRED_SLOTS = %w[body eyes].freeze

    validates :name, presence: true, uniqueness: true
    validate :look_slot_rules, if: -> { data["parts"].present? }
    validate :owner_look_cap, on: :create, if: :owner_id?

    # The single live character the game/preview loads (nil if none saved yet).
    def self.current
      find_by(active: true)
    end

    # Make this row the one active manifest. Clearing the others first keeps the
    # single-active partial unique index happy; the transaction makes the swap
    # atomic.
    def activate!
      transaction do
        CharacterManifest.where.not(id: id).update_all(active: false)
        update!(active: true)
      end
    end

    private

    def look_slot_rules
      by_slot = Array(data["parts"]).group_by { |p| p.to_s.split("-").first }
      REQUIRED_SLOTS.each { |s| errors.add(:base, "A Look needs a #{s}.") unless by_slot[s]&.any? }
      by_slot.each do |slot, parts|
        max = SLOT_MAX[slot]
        if max.nil?
          errors.add(:base, "Unknown part slot: #{slot}.")
        elsif parts.size > max
          errors.add(:base, "A Look allows at most #{max} #{slot}#{"s" if max > 1}.")
        end
      end
    end

    def owner_look_cap
      return if CharacterManifest.where(owner_id: owner_id).count < MAX_LOOKS

      errors.add(:base, "You can keep at most three Looks — delete one to save another.")
    end
  end
end
