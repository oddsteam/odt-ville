# The Viewer domain module (ADR-0010): the current user's own view of the world
# — who they are (the `me` endpoint) and their per-item content read/ack state.
# The empty table-name prefix keeps the pre-namespacing table name
# (`user_content_states`, not `viewer_user_content_states`); new viewer tables
# should carry the `viewer_` prefix explicitly (CONTEXT.md "Domain modules").
module Viewer
  def self.table_name_prefix
    ""
  end
end
