# JSON payload for a Standee the runtime places on a map (#369, ADR-0015). The
# cell rides as `x`/`y` — the tile-coordinate shape the map's placed entities
# already use — and the rig is a *reference*: `character_manifest_id` resolved
# from the owner (never a copy of the manifest), so changing your character
# restyles every Standee. `message` is the Placard's short line.
module Standees
  module StandeeSerializer
    module_function

    def call(standee)
      {
        id: standee.id,
        x: standee.cell_x,
        y: standee.cell_y,
        message: standee.message,
        character_manifest_id: standee.character_manifest_id
      }
    end
  end
end
