# Site-scoped hometown buildings (#497): which client engagement a community
# belongs to, keyed by site *name* (FK-less, per the soft-seam rule — not a
# hard FK into org_sites). Null = downtown-scoped, which still renders for
# everyone at this stage. The hometown read filters the building list to the
# caller's effective sites plus downtown.
class AddSiteToHouses < ActiveRecord::Migration[8.1]
  def change
    add_column :houses, :site, :string
  end
end
