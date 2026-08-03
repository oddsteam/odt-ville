require "test_helper"

# The Standees budget (#371, ADR-0015): a user may have at most 3 Standees out
# at once, counted across *every* map — not 3 per map. These specs pin the
# arithmetic (out / remaining / allows?) at, below and over the cap, and the
# load-bearing rule that the count spans maps rather than being per-map.
module Standees
  class BudgetTest < ActiveSupport::TestCase
    setup do
      @company, @user = setup_company
    end

    def make_map(slug:)
      ::Maps::Map.create!(
        slug: slug, title: slug.titleize, multiplayer: true,
        access_policy: { "kind" => "public" }, cols: 8, rows: 8, baked: {}
      )
    end

    def stand(map, user: @user, x: 1, y: 1, message: "hi")
      ::Standees::Standee.create!(map: map, user: user, cell_x: x, cell_y: y, message: message)
    end

    test "an employee with none out may deploy — 3 remaining" do
      budget = ::Standees::Budget.for(@user)
      assert_equal 0, budget.out
      assert_equal 3, budget.remaining
      assert budget.allows?
      assert_nil budget.refusal
    end

    test "below the cap still allows, remaining counts down" do
      map = make_map(slug: "plaza")
      stand(map)
      stand(map)

      budget = ::Standees::Budget.for(@user)
      assert_equal 2, budget.out
      assert_equal 1, budget.remaining
      assert budget.allows?
    end

    test "at the cap the deploy is refused with a located pointer" do
      plaza = make_map(slug: "plaza")
      grove = make_map(slug: "grove")
      stand(plaza, x: 3, y: 5)
      stand(grove, x: 2, y: 2)
      stand(plaza, x: 1, y: 1)

      budget = ::Standees::Budget.for(@user)
      assert_equal 3, budget.out
      assert_equal 0, budget.remaining
      refute budget.allows?
      # The refusal names where the existing Standees are standing.
      assert_match "Plaza (3, 5)", budget.refusal
      assert_match "Grove (2, 2)", budget.refusal
      assert_match "Plaza (1, 1)", budget.refusal
    end

    test "the count spans maps, not per-map" do
      # Three maps, one Standee each — that is the cap, even though no single map
      # holds more than one. Per-map counting would wrongly still allow.
      %w[a b c].each { |slug| stand(make_map(slug: slug)) }

      budget = ::Standees::Budget.for(@user)
      assert_equal 3, budget.out
      refute budget.allows?
    end

    test "another employee's Standees do not count against mine" do
      _, other = setup_company
      map = make_map(slug: "plaza")
      stand(map, user: other)
      stand(map, user: other)
      stand(map, user: other)

      budget = ::Standees::Budget.for(@user)
      assert_equal 0, budget.out
      assert budget.allows?
    end
  end
end
