require "test_helper"

# The Standee's invariants live on the model (#519, ADR-0015), so a direct POST
# — or any second writer (console, job, future admin tool) — cannot bypass them.
# These specs pin the Placard's length caps, the multiplayer-only rule, and
# owner-only pickup on the record itself, not on the controller that reaches it.
module Standees
  class StandeeTest < ActiveSupport::TestCase
    # test_helper mixes the fixture builders into integration tests only; this
    # is a model test, so it asks for them itself.
    include ApiTestHelpers

    setup do
      @company, @user = setup_company
    end

    def make_map(slug: "plaza", multiplayer: true)
      ::Maps::Map.create!(
        slug: slug, title: slug.titleize, multiplayer: multiplayer,
        access_policy: { "kind" => "public" }, cols: 8, rows: 8, baked: {}
      )
    end

    def build_standee(map: make_map, message: "Jogging Sunday?", detail: nil)
      ::Standees::Standee.new(map: map, user: @user, cell_x: 1, cell_y: 1,
                              message: message, detail: detail)
    end

    test "a 60-character short line is valid, 61 is too long" do
      assert build_standee(message: "a" * 60).valid?
      refute build_standee(message: "a" * 61).valid?
    end

    test "a 500-character detail is valid, 501 is too long" do
      assert build_standee(detail: "a" * 500).valid?
      refute build_standee(detail: "a" * 501).valid?
    end

    test "a Standee with no detail is valid" do
      assert build_standee(detail: nil).valid?
    end

    test "a Standee on a non-multiplayer map is invalid" do
      refute build_standee(map: make_map(slug: "hometown", multiplayer: false)).valid?
    end

    test "a Standee on a multiplayer map is valid" do
      assert build_standee(map: make_map).valid?
    end

    test "pickable_by? is true for the owner only" do
      _, other = setup_company
      standee = build_standee
      assert standee.pickable_by?(@user)
      refute standee.pickable_by?(other)
    end
  end
end
