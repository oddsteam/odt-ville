# The Character domain module (ADR-0010): the sprite manifests saved by the
# sprite-mapper and read by the game/preview — the roster and the single live
# character. The empty table-name prefix keeps the pre-namespacing table name
# (`character_manifests`, not `character_character_manifests`); new character
# tables should carry the `character_` prefix explicitly (CONTEXT.md "Domain
# modules").
module Character
  def self.table_name_prefix
    ""
  end
end
