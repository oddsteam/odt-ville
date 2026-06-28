require "test_helper"

class MonsterTest < ActiveSupport::TestCase
  def make(name:, rate:, enabled: true)
    Monster.create!(name: name, image: "data:img", encounter_rate: rate, enabled: enabled)
  end

  test "name is required and unique" do
    make(name: "Slime", rate: 1)
    dup = Monster.new(name: "Slime", image: "data:img", encounter_rate: 1)
    assert_not dup.valid?
    assert_includes dup.errors[:name], "has already been taken"

    blank = Monster.new(image: "data:img", encounter_rate: 1)
    assert_not blank.valid?
  end

  test "encounter_rate must be a non-negative integer" do
    assert_not Monster.new(name: "A", image: "i", encounter_rate: -1).valid?
    assert_not Monster.new(name: "B", image: "i", encounter_rate: 1.5).valid?
    assert Monster.new(name: "C", image: "i", encounter_rate: 0).valid?
  end

  test "probability is the weighted split across enabled monsters" do
    a = make(name: "A", rate: 1)
    b = make(name: "B", rate: 3)

    total = Monster.enabled_rate_total
    assert_equal 4, total
    assert_in_delta 0.25, a.probability(total), 1e-9
    assert_in_delta 0.75, b.probability(total), 1e-9
  end

  test "a single enabled monster has probability 1.0" do
    a = make(name: "Only", rate: 7)
    assert_in_delta 1.0, a.probability, 1e-9
  end

  test "disabled monsters show 0 and are excluded from the denominator" do
    enabled = make(name: "On", rate: 2)
    disabled = make(name: "Off", rate: 8, enabled: false)

    total = Monster.enabled_rate_total
    assert_equal 2, total, "disabled rate is not in the pool"
    assert_in_delta 1.0, enabled.probability(total), 1e-9
    assert_equal 0.0, disabled.probability(total)
  end

  test "an empty or zero-sum pool yields 0 without divide-by-zero" do
    assert_equal 0, Monster.enabled_rate_total

    zero = make(name: "Zero", rate: 0)
    assert_equal 0, Monster.enabled_rate_total
    assert_equal 0.0, zero.probability
  end

  test "image_data_url seam reads and writes the image column" do
    m = make(name: "Seam", rate: 1)
    m.image_data_url = "data:image/png;base64,new"
    assert_equal "data:image/png;base64,new", m.image
    assert_equal "data:image/png;base64,new", m.image_data_url
  end
end
