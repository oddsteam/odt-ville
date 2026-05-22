class UserLocationState < ApplicationRecord
  belongs_to :user
  belongs_to :company

  enum :last_area, {
    town: "town",
    house: "house"
  }

  # last_house_id is a plain column (not an association) on purpose: the house
  # it points at may have been deleted or deactivated.
end
