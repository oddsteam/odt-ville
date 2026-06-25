# JSON payloads for the tile-object API. `call` is the full object (with the
# image data URL the game draws); `summary` is the lightweight roster row,
# which omits the (large) image blob.
module TileObjectSerializer
  module_function

  def call(obj)
    summary(obj).merge(image: obj.image)
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
      active: obj.active,
      updated_at: obj.updated_at
    }
  end
end
