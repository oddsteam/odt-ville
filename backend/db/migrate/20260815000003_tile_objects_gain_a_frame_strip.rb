class TileObjectsGainAFrameStrip < ActiveRecord::Migration[8.1]
  def change
    # Animated catalog art (ADR-0019, #435). An animated object is not a new
    # kind — it is a tile object whose `image` is a horizontal frame strip and
    # whose `frame_count` is > 1. Frame size is derived from the image
    # (imageWidth / frame_count × imageHeight), never from footprint_w/h, which
    # are floats. `frame_count: 1` is today's still object, unchanged.
    add_column :tile_objects, :frame_count, :integer, default: 1, null: false
    # Frames per second; nil lets the runtime pick its default.
    add_column :tile_objects, :fps, :integer
    # 'loop' (time drives the playhead) or 'proximity' (the avatar's distance
    # does, #A4). A property of the art, so a door behaves like a door on every
    # map that places it.
    add_column :tile_objects, :playback, :string, default: "loop", null: false
  end
end
