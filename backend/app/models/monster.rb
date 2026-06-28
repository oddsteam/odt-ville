class Monster < ApplicationRecord
  validates :name, presence: true, uniqueness: true
  validates :encounter_rate,
            numericality: { only_integer: true, greater_than_or_equal_to: 0 }

  # Sum of the encounter weights that make up the live wild-encounter pool.
  # Disabled monsters contribute nothing, so they drop out of the denominator.
  def self.enabled_rate_total
    where(enabled: true).sum(:encounter_rate)
  end

  # Encounter probability as a fraction in [0, 1]: this monster's rate over the
  # sum of all enabled monsters' rates. Disabled monsters — and an empty or
  # zero-sum pool — yield 0, so there's never a divide-by-zero. Pass the pool
  # total in to avoid an N+1 when serializing a whole roster.
  def probability(pool_total = self.class.enabled_rate_total)
    return 0.0 unless enabled
    return 0.0 if pool_total.zero?

    encounter_rate.to_f / pool_total
  end

  # Image read/write seam. The data URL lives directly in the text column for
  # now; routing every caller through this accessor means a future move to
  # S3/MinIO (store a key, fetch the blob) changes only this one place.
  def image_data_url
    image
  end

  def image_data_url=(value)
    self.image = value
  end
end
