# JSON payloads for the monster API. `summary` is the lightweight roster row
# (omits the heavy image blob, matching TileObjectSerializer.summary); `call`
# is the full record incl. the image data URL for future edit forms.
#
# `probability` is a fraction in [0, 1]: encounter_rate / sum(enabled rates).
# The roster passes the pool total in once so the whole list shares one query.
module MonsterSerializer
  module_function

  def summary(monster, pool_total = Monster.enabled_rate_total)
    {
      id: monster.id,
      name: monster.name,
      encounter_dialog: monster.encounter_dialog,
      encounter_rate: monster.encounter_rate,
      enabled: monster.enabled,
      probability: monster.probability(pool_total),
      updated_at: monster.updated_at
    }
  end

  def call(monster, pool_total = Monster.enabled_rate_total)
    summary(monster, pool_total).merge(image: monster.image_data_url)
  end

  # The wild-encounter pool row: just what the game needs to roll and render an
  # encounter — id, name, authored dialog, weight, and the sprite image. No
  # probability/roster fields (the pool is already filtered to enabled monsters).
  def pool_entry(monster)
    {
      id: monster.id,
      name: monster.name,
      encounter_dialog: monster.encounter_dialog,
      encounter_rate: monster.encounter_rate,
      image: monster.image_data_url
    }
  end
end
