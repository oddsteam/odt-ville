# JSON payload for a baked map the runtime blits. Identity (slug/title/size)
# sits alongside the baked artifact's own keys (tilesets, tiles, entities), so
# the game receives one self-describing document and never has to branch on
# which producer made it (ADR-0004). The editable `source` is intentionally not
# exposed on the play endpoint — only the editor reads source.
module MapSerializer
  module_function

  def call(map)
    baked = map.baked.is_a?(Hash) ? map.baked.deep_symbolize_keys : {}
    {
      slug: map.slug,
      title: map.title,
      cols: map.cols,
      rows: map.rows,
      tilesets: baked[:tilesets] || [],
      tiles: baked[:tiles] || [],
      entities: baked[:entities] || []
    }
  end
end
