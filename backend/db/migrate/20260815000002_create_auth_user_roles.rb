# App-authored authorization roles (#429): the app becomes a source of truth
# for the admin gate, so an admin can be minted without touching Keycloak. The
# gate reads the UNION of a token's realm roles and these rows (current_roles),
# so a grant takes effect on the grantee's next page load — no re-login. Kept
# distinct from users.role (company membership): future admin tiers drop in as
# new role strings, not a migration rewrite. Carries the explicit auth_ prefix
# new Auth tables use (the module's empty prefix predates the rule).
class CreateAuthUserRoles < ActiveRecord::Migration[8.1]
  def change
    create_table :auth_user_roles do |t|
      t.references :user, null: false, foreign_key: true
      t.string :role, null: false
      # The admin who issued the grant, for the roster's audit line (#431).
      # Nullable and a plain reference to users: a console/bootstrap grant has
      # no actor. Both FKs point at users; the schema-lint allowlist carries it.
      t.references :granted_by, foreign_key: { to_table: :users }
      t.datetime :created_at, null: false
      t.index %i[user_id role], unique: true
    end
  end
end
