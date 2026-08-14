# The link between a Keycloak login and the person on the roster (#390,
# ADR-0016). Nullable on purpose and forever: an Employee with no User has not
# logged in yet, and a User with no Employee (contractor, service account, an
# address Keycloak spells differently) is a normal state, never an error.
class AddEmployeeToUsers < ActiveRecord::Migration[8.1]
  def change
    # A plain bigint, not `t.references`: this crosses the game<->org seam,
    # which ADR-0010 keeps soft, so there is no foreign key.
    add_column :users, :employee_id, :bigint
    add_index :users, :employee_id
  end
end
