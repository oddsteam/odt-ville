# Client site membership (#499, ADR-0020): a Client is given their site with a
# FK-less string keyed by site *name* (soft-seam rule), so the roster sync never
# sees it. It lives on the User, not the Employee: the sync replaces
# `Employee.sites` wholesale and would wipe it, and an external Client is not on
# the roster at all. Nullable — most logins are Staff and carry none.
class AddClientSiteToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :client_site, :string
  end
end
