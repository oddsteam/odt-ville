module Maps
  # A row admits its user to a `members`-gated map (#83). Cross-module: the
  # user lives in Auth (ADR-0010). Table carries the explicit `maps_` prefix
  # new maps tables use (the module's empty prefix predates the rule).
  class MapMembership < ApplicationRecord
    self.table_name = "maps_map_memberships"

    belongs_to :map, class_name: "Maps::Map"
    belongs_to :user, class_name: "Auth::User"
  end
end
