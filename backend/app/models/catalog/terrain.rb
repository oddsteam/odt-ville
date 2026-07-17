module Catalog
  class Terrain < ApplicationRecord
    validates :name, presence: true, uniqueness: true
    validates :priority, presence: true

    # Terrains low→high priority — the seam-ownership order the Tile Catalog
    # resolves against (higher priority owns a shared seam). `name` breaks ties so
    # the order is stable when two terrains share a priority.
    scope :ordered, -> { order(:priority, :name) }

    # Ensure a row exists for a freshly-introduced surface type, parked at the top
    # of the stack (next-highest priority) so a new terrain paints over what's
    # already there until the author reorders it. Idempotent — re-tagging an
    # existing terrain leaves its priority untouched.
    def self.register!(name)
      name = name.to_s.strip
      return if name.blank?

      find_or_create_by!(name: name) do |terrain|
        terrain.priority = (maximum(:priority) || -1) + 1
      end
    end

    # Set the whole priority order from an ordered name list (low→high). The map
    # editor persists a reorder here, so seam ownership is data the tool flips —
    # not a hardcoded stack. `priority` becomes the list position.
    def self.reorder!(names)
      Array(names).map { |n| n.to_s.strip }.reject(&:blank?).each_with_index do |name, i|
        where(name: name).update_all(priority: i)
      end
    end
  end
end
