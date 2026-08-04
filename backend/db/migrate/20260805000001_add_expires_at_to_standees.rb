# A Standee is time-bound by construction (#374, ADR-0015): the owner sets a
# window when deploying — 7 days by default, 30 at most — and the cutout retires
# itself when it passes. The deliberate inversion of the billboard back-pressure
# principle: billboard clutter has executives to correct it, peer clutter has no
# gardener, so a Standee decays instead.
#
# No sweeper and no cron follows this column: the load query simply excludes
# expired rows and the client, holding the expiry, retires the cutout itself.
# Rows deployed before this migration get the same 7-day window from when they
# went up, so nothing is left standing forever.
class AddExpiresAtToStandees < ActiveRecord::Migration[8.1]
  def up
    add_column :standees, :expires_at, :datetime
    execute "UPDATE standees SET expires_at = created_at + INTERVAL '7 days' WHERE expires_at IS NULL"
    change_column_null :standees, :expires_at, false
  end

  def down
    remove_column :standees, :expires_at
  end
end
