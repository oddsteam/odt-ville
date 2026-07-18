# Dev-only staleness signal (issue #225): the dev container keeps serving
# boot-time code for restart-sensitive changes (config/**, Gemfile.lock, bulk
# file moves), so we capture HEAD's sha at boot and let /api/v1/dev/staleness
# (routes.rb, dev-only) compare it against the working tree's current HEAD.
# compose.override.yaml bind-mounts the repo's .git read-only at /repo.git;
# HEAD is parsed with plain file reads — the git binary would refuse the
# cross-uid mount ("dubious ownership") and safe.directory can't be set via -c.
module DevStaleness
  GIT_DIR = ENV.fetch("REPO_GIT_DIR", "/repo.git")

  def self.head_sha(git_dir = GIT_DIR)
    head = File.read(File.join(git_dir, "HEAD")).strip
    return head unless head.start_with?("ref: ")
    ref = head.delete_prefix("ref: ").strip
    loose = File.join(git_dir, ref)
    return File.read(loose).strip if File.file?(loose)
    File.foreach(File.join(git_dir, "packed-refs")) do |line|
      sha, name = line.split
      return sha if name == ref
    end
    nil
  rescue SystemCallError
    nil
  end

  def self.report
    current = head_sha
    {
      boot_sha: BOOT_SHA,
      current_sha: current,
      stale: !!(BOOT_SHA && current && BOOT_SHA != current),
    }
  end
end

DevStaleness::BOOT_SHA = Rails.env.development? ? DevStaleness.head_sha : nil
