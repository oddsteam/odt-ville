require "test_helper"
require Rails.root.join("config/initializers/dev_staleness")

class DevStalenessTest < ActiveSupport::TestCase
  test "reads a loose branch ref" do
    Dir.mktmpdir do |git|
      File.write(File.join(git, "HEAD"), "ref: refs/heads/main\n")
      FileUtils.mkdir_p(File.join(git, "refs/heads"))
      File.write(File.join(git, "refs/heads/main"), "abc123\n")
      assert_equal "abc123", DevStaleness.head_sha(git)
    end
  end

  test "falls back to packed-refs" do
    Dir.mktmpdir do |git|
      File.write(File.join(git, "HEAD"), "ref: refs/heads/main\n")
      File.write(File.join(git, "packed-refs"),
        "# pack-refs with: peeled fully-peeled sorted \ndef456 refs/heads/main\n")
      assert_equal "def456", DevStaleness.head_sha(git)
    end
  end

  test "returns a detached HEAD sha directly" do
    Dir.mktmpdir do |git|
      File.write(File.join(git, "HEAD"), "cafe99\n")
      assert_equal "cafe99", DevStaleness.head_sha(git)
    end
  end

  test "returns nil when the git dir is absent or unreadable" do
    assert_nil DevStaleness.head_sha("/nonexistent")
  end
end
