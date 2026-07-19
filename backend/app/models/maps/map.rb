# An authored map — the persisted producer of the runtime map shape (ADR-0004).
# It carries both the editable `source` and the `baked` artifact the game blits
# (ADR-0003); for now only `baked` is read by the runtime, `source` waits for
# the editor. Loaded by slug, never by numeric id, so the game has a stable URL.
module Maps
  class Map < ApplicationRecord
    has_many :memberships, class_name: "Maps::MapMembership", dependent: :delete_all

    validates :slug, presence: true,
                     uniqueness: true,
                     format: { with: /\A[a-z0-9][a-z0-9-]*\z/,
                               message: "must be lowercase letters, digits and hyphens" }
    validates :title, presence: true
    validates :cols, :rows, numericality: { only_integer: true, greater_than: 0 }
    validate :access_policy_permitted
    validate :document_playable

    # The stored jsonb, wrapped in its value object (#83).
    def access_policy
      AccessPolicy.wrap(super)
    end

    # The server-side gate for list, load and (later) multiplayer room join.
    def accessible_to?(user, roles:, groups:)
      access_policy.allows?(roles: roles, groups: groups) do
        memberships.exists?(user: user)
      end
    end

    private

    # Playability (#82): each reason is its own error so the editor can list
    # every problem in one rejected save.
    def document_playable
      DocumentValidator.reasons_for(self).each { |reason| errors.add(:base, reason) }
    end

    def access_policy_permitted
      policy = access_policy
      return errors.add(:access_policy, "has unknown kind #{policy.kind.inspect}") unless AccessPolicy::KINDS.include?(policy.kind)

      errors.add(:access_policy, "claim needs a role or group") if policy.kind == "claim" && policy.role.blank? && policy.group.blank?
    end
  end
end
