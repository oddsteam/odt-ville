module GameSession
  class UserLocationState < ApplicationRecord
    # Cross-module targets are namespaced (ADR-0010); name them explicitly
    # since Rails can't infer Auth::User / Org::Company from :user / :company.
    belongs_to :user, class_name: "Auth::User"
    belongs_to :company, class_name: "Org::Company"

    enum :last_area, {
      town: "town",
      house: "house"
    }

    # last_house_id is a plain column (not an association) on purpose: the house
    # it points at may have been deleted or deactivated.
  end
end
