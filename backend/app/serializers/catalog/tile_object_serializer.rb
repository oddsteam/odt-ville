module Catalog
  # JSON payloads for the tile-object API. `call` is the full object (with the
  # image data URL the game draws); `summary` is the lightweight roster row,
  # which omits the (large) image blob.
  module TileObjectSerializer
    module_function

    def call(obj)
      # Foreground mask (#36) rides on the full object only — it's an image-
      # resolution blob, too heavy for the roster summary.
      summary(obj).merge(image: obj.image, fg_mask: obj.fg_mask)
    end

    # `show` alone — the mapper reopening an object to remix it. Adds the
    # editor-only composition (#355, ADR-0014) on top of the full object. Kept
    # off `call` so the game's batched read (index?ids) and `active` stay lean:
    # the game never reads the composition, only the flat `image`.
    def detail(obj)
      call(obj).merge(composition: obj.composition)
    end

    def summary(obj)
      {
        id: obj.id,
        name: obj.name,
        kind: obj.kind,
        footprint_w: obj.footprint_w,
        footprint_h: obj.footprint_h,
        door_dx: obj.door_dx,
        door_dy: obj.door_dy,
        # Interior walk mask (#32): newline-joined rows in the column, split back
        # into a row-major array of strings ('#' solid, '.' walkable). Nil when
        # unmapped so the game falls back to a solid building box.
        walk_mask: obj.walk_mask&.split("\n"),
        # Impassable cell borders (#53): newline-joined hex-digit rows in the
        # column, split back into a row-major array. Nil when none authored.
        edge_mask: obj.edge_mask&.split("\n"),
        # Animated art (#435, ADR-0019): `image` is a horizontal frame strip
        # when frame_count > 1 — the frame size is derived from the image, so
        # nothing else needs serializing. On the summary because the decorate
        # palette lists summaries and the full object spreads them.
        frame_count: obj.frame_count,
        fps: obj.fps,
        playback: obj.playback,
        active: obj.active,
        updated_at: obj.updated_at
      }
    end
  end
end
