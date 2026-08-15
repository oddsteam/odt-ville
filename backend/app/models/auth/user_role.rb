module Auth
  # An app-granted authorization role (#429). The admin gate reads the UNION of
  # a user's JWT realm roles and these rows, so a grant lands on the grantee's
  # next page load — no Keycloak change, no re-login. Distinct from users.role
  # (company membership): future admin tiers are new role strings here, not a
  # schema change. Table carries the explicit auth_ prefix new Auth tables use
  # (the module's empty prefix predates the rule).
  class UserRole < ApplicationRecord
    self.table_name = "auth_user_roles"

    belongs_to :user, class_name: "Auth::User"
    # The admin who issued the grant, for the roster's audit line (#431). A
    # console/bootstrap grant has no actor, so it is optional.
    belongs_to :granted_by, class_name: "Auth::User", optional: true
  end
end
