# The GameSession domain module (ADR-0010): the village game's per-user session
# — the coarse last location (area + last community) the spawn resolves from.
# The empty table-name prefix keeps the pre-namespacing table name
# (`user_location_states`, not `game_session_user_location_states`); new
# game-session tables should carry the `game_session_` prefix explicitly
# (CONTEXT.md "Domain modules").
module GameSession
  def self.table_name_prefix
    ""
  end
end
