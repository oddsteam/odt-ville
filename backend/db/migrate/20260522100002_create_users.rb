class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.references :company, null: false, foreign_key: true
      t.string :name, null: false
      t.string :role, null: false, default: "employee"

      t.timestamps
    end
  end
end
