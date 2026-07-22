class NpcsReferenceACharacterManifest < ActiveRecord::Migration[8.1]
  def up
    # #260: an NPC's art is a *mapped rig*, not a flat PNG. NPCs are meant to
    # walk, and a still image cannot face four directions — so the sprite mapper
    # becomes the one place character art is authored, with two tracks consuming
    # its roster: a user picking their own character (ADR-0009) and an admin
    # picking an NPC's.
    #
    # Nullable with on_delete: :nullify, mirroring users.character_manifest_id
    # verbatim — deleting a rig leaves the NPC's identity intact and artless
    # rather than cascading a catalog row away.
    add_reference :catalog_npcs, :character_manifest,
      null: true, foreign_key: { on_delete: :nullify }

    # The hand-made "THE BOSS" row predates this and cannot survive it: it is
    # image-backed, was never reproducible from seeds, and its seed block goes
    # away in the same change. Dropped deliberately (#260) rather than left as
    # an artless row. Any *other* pre-existing NPC survives and can be pointed
    # at a rig — or deleted — in the NPC admin.
    execute "DELETE FROM catalog_npcs WHERE name = 'THE BOSS'"

    remove_column :catalog_npcs, :image
  end

  def down
    # Irreversible in substance: the dropped data URLs are gone. Restore the
    # column shape so a rollback at least leaves a loadable schema.
    add_column :catalog_npcs, :image, :text, null: false, default: ""
    remove_reference :catalog_npcs, :character_manifest, foreign_key: true
  end
end
