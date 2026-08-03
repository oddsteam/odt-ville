# JSON payload for a Standee the runtime places on a map (#369, ADR-0015). The
# cell rides as `x`/`y` — the tile-coordinate shape the map's placed entities
# already use — and the rig is a *reference*: `character_manifest_id` resolved
# from the owner (never a copy of the manifest), so changing your character
# restyles every Standee. `message` is the Placard's short line.
module Standees
  module StandeeSerializer
    module_function

    def call(standee)
      owner = standee.user
      {
        id: standee.id,
        x: standee.cell_x,
        y: standee.cell_y,
        message: standee.message,
        # The Placard's detail body (#372), revealed on press-A; null when the
        # owner left only a short line.
        detail: standee.detail,
        # Who left it, for the full Placard (#372): the owner's name and face.
        # The face rides the same avatar proxy path the header uses (ADR-0012 —
        # never Basecamp's URL), and is null when the owner has no avatar.
        owner_name: owner&.name,
        owner_avatar_url: owner&.avatar_url && "/api/v1/users/#{owner.external_id}/avatar",
        character_manifest_id: standee.character_manifest_id
      }
    end

    # The owner's view of one of their own Standees, for the budget list (#371).
    # Carries the map it stands on (slug + title) so the client can name where
    # each Standee is — the same located pointer the write-path refusal gives.
    def mine(standee)
      {
        id: standee.id,
        map_slug: standee.map.slug,
        map_title: standee.map.title,
        x: standee.cell_x,
        y: standee.cell_y,
        message: standee.message
      }
    end
  end
end
