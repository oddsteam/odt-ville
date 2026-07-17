# The Auth domain module (ADR-0010): Keycloak identity — the User and the
# KeycloakAuthenticator that resolves a bearer token to verified claims. The
# empty table-name prefix keeps the pre-namespacing table name (`users`, not
# `auth_users`); new auth tables should carry the `auth_` prefix explicitly
# (CONTEXT.md "Domain modules").
module Auth
  def self.table_name_prefix
    ""
  end
end
