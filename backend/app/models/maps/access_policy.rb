module Maps
  # Who may list/load — and later multiplayer-join — a map (#83), interpreted
  # from the map's `access_policy` jsonb. `public` admits any authenticated
  # user; `claim` admits a matching Keycloak role or group; `members` defers
  # to the yielded membership check so public/claim maps never query it.
  class AccessPolicy
    KINDS = %w[public claim members].freeze

    def self.wrap(hash)
      h = hash.is_a?(Hash) ? hash.stringify_keys : {}
      new(kind: h["kind"] || "public", role: h["role"], group: h["group"])
    end

    attr_reader :kind, :role, :group

    def initialize(kind:, role: nil, group: nil)
      @kind = kind
      @role = role
      @group = group
    end

    def allows?(roles:, groups:)
      case kind
      when "public" then true
      when "claim" then (role.present? && roles.include?(role)) ||
                        (group.present? && groups.include?(group))
      when "members" then yield
      else false
      end
    end
  end
end
