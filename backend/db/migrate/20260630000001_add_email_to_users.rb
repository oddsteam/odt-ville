class AddEmailToUsers < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :email, :string
    # JIT provisioning keys on email (#96); unique so a domain login maps to one
    # user. Existing local-only users have NULL email (multiple NULLs allowed).
    add_index :users, :email, unique: true
  end
end
