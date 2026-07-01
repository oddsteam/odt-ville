# An authored map — the persisted producer of the runtime map shape (ADR-0004).
# It carries both the editable `source` and the `baked` artifact the game blits
# (ADR-0003); for now only `baked` is read by the runtime, `source` waits for
# the editor. Loaded by slug, never by numeric id, so the game has a stable URL.
class Map < ApplicationRecord
  validates :slug, presence: true,
                   uniqueness: true,
                   format: { with: /\A[a-z0-9][a-z0-9-]*\z/,
                             message: "must be lowercase letters, digits and hyphens" }
  validates :title, presence: true
  validates :cols, :rows, numericality: { only_integer: true, greater_than: 0 }
end
