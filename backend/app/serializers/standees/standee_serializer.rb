# JSON payload for a Standee the runtime places on a map (#369, ADR-0015). The
# cell rides as `x`/`y` — the tile-coordinate shape the map's placed entities
# already use — and the rig is a *reference*: `character_manifest_id` resolved
# from the owner (never a copy of the manifest), so changing your character
# restyles every Standee. `message` is the Placard's short line.
module Standees
  module StandeeSerializer
    module_function

    def call(standee, viewer: nil)
      owner = standee.user
      {
        id: standee.id,
        x: standee.cell_x,
        y: standee.cell_y,
        message: standee.message,
        # Whether the caller owns this Standee (#370): press-A offers *pick up*
        # on your own cutout where it offers *reply* on someone else's, so the
        # runtime is told which is which. Resolved against the authenticated
        # caller — false when serialized without a viewer.
        mine: viewer.present? && standee.user_id == viewer.id,
        # The Placard's detail body (#372), revealed on press-A; null when the
        # owner left only a short line.
        detail: standee.detail,
        # The owner-supplied reply link (#373): the campfire or thread to reply
        # in, stored raw and null when none. The client gates the click-through
        # to http(s) only, matching the card-badge rule.
        reply_link: standee.reply_link,
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
