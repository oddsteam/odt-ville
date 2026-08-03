# The Placard's detail body (#372, ADR-0015): the longer text a Standee reveals
# when a visitor presses A — the time, the place, what to bring — kept off the
# map so the overhead short line stays a glance. Optional: a Standee with only a
# short line still says its piece, so a null detail is a valid Placard.
class AddDetailToStandees < ActiveRecord::Migration[8.1]
  def change
    add_column :standees, :detail, :text
  end
end
