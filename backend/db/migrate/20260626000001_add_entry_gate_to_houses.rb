class AddEntryGateToHouses < ActiveRecord::Migration[8.1]
  def change
    # Per-house entry gate (issue #24). `entry_gate` names the gate the door
    # runs before opening (e.g. "posture-login"); null = ungated, opens at once.
    # `posture_set_id` is the posture-login Posture Set the gate verifies against
    # — server-only, looked up by the start endpoint, never shipped to the browser.
    add_column :houses, :entry_gate, :string
    add_column :houses, :posture_set_id, :string
  end
end
