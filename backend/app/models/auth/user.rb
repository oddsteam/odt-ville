module Auth
  class User < ApplicationRecord
    # Cross-module: a User belongs to an Org::Company (ADR-0010).
    belongs_to :company, class_name: "Org::Company"
    # The user's picked character (#155, ADR-0009); nil falls back to the
    # global active manifest. Cross-module targets are namespaced (ADR-0010),
    # so name them explicitly since Rails can't infer them from the association.
    belongs_to :character_manifest, class_name: "Character::CharacterManifest", optional: true
    # The person this login belongs to (#390, ADR-0016). Optional forever: a
    # User with no Employee is not on the roster, which is normal, not an error.
    belongs_to :employee, class_name: "Org::Employee", optional: true
    has_many :user_content_states, class_name: "Viewer::UserContentState", dependent: :destroy
    has_one :user_location_state, class_name: "GameSession::UserLocationState", dependent: :destroy

    validates :name, presence: true
    # The OIDC subject is optional (local-only users), but when present it must
    # map to exactly one user so a verified token resolves unambiguously (#92).
    validates :external_id, uniqueness: true, allow_nil: true

    # Joins this login to its roster person on lowercased email (#390) — the
    # same key provisioning and Basecamp::AvatarSync already use, so the roster
    # shares one identity seam with everything else. The importer backfill and
    # the login path both call this, so the two cannot drift. Already linked
    # stays linked; no match is a normal outcome and returns nil.
    def link_employee!
      return employee if employee_id || email.blank?

      ::Org::Employee.find_by(email: email.downcase)&.tap { update!(employee: _1) }
    end

    # The character this user renders (#155, ADR-0009): their pick, else the
    # global active. One resolution shared by the for_me read and the presence
    # frames peers render each other from (#266).
    def effective_character_manifest
      character_manifest || ::Character::CharacterManifest.current
    end

    # The location row is a per-user singleton. Create it lazily so a brand-new
    # user is treated as a first-time visitor (spawns at Town Entrance).
    def location_state
      user_location_state || create_user_location_state!(company: company, last_area: "town")
    end
  end
end
