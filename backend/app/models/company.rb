class Company < ApplicationRecord
  has_many :users, dependent: :destroy
  has_many :houses, dependent: :destroy

  validates :name, presence: true
end
