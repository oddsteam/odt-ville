# The Placard's reply link (#373, ADR-0015): the campfire or thread the owner
# supplies so interested people land in the one conversation they have already
# started, rather than three separate pings. Owner-supplied and stored raw — the
# client gates the click-through to http(s) only. Optional: a Standee with no
# reply link still says its piece, so a null reply_link is a valid Placard.
class AddReplyLinkToStandees < ActiveRecord::Migration[8.1]
  def change
    add_column :standees, :reply_link, :string
  end
end
