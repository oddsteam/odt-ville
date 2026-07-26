class AddAvatarUrlToUsers < ActiveRecord::Migration[8.1]
  def change
    # Server-only (ADR-0012): holds Basecamp's rotating signed URL, which never
    # leaves the backend. The browser gets /api/v1/users/<external_id>/avatar.
    add_column :users, :avatar_url, :string
  end
end
