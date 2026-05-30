class User < ApplicationRecord
  belongs_to :company
  has_many :user_content_states, dependent: :destroy
  has_one :user_location_state, dependent: :destroy

  validates :name, presence: true

  # Find or create the local User for a verified Keycloak token's claims.
  # `sub` is the stable external identity; name/email/role are refreshed on
  # each login so Keycloak stays the source of truth. New users join the single
  # POC company (the one the seed created).
  def self.from_keycloak_claims(claims)
    sub = claims["sub"]
    raise ArgumentError, "token has no sub" if sub.blank?

    company = Company.first || Company.create!(name: "ODT")
    user = find_or_initialize_by(external_id: sub)
    user.company = company
    user.email = claims["email"]
    user.name = claims["name"].presence ||
                claims["preferred_username"].presence ||
                claims["email"].presence ||
                "Employee"
    user.role = role_from_claims(claims)
    user.save!
    user
  end

  # Map Keycloak realm roles onto the app's coarse role. Defaults to the
  # ordinary employee role.
  def self.role_from_claims(claims)
    realm_roles = claims.dig("realm_access", "roles") || []
    return "admin" if (realm_roles & %w[village_admin admin]).any?

    "branch_employee"
  end

  # The location row is a per-user singleton. Create it lazily so a brand-new
  # user is treated as a first-time visitor (spawns at Town Entrance).
  def location_state
    user_location_state || create_user_location_state!(company: company, last_area: "town")
  end
end
