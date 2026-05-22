ENV["BUNDLE_GEMFILE"] ||= File.expand_path("../Gemfile", __dir__)

# This project's backend port from the POC ports.json registry. Set here (before
# `rails/commands` runs) so a plain `bin/rails server` binds to 3130 without a
# `-p` flag. An explicit PORT env var or `-p` still wins.
ENV["PORT"] ||= "3130"

require "bundler/setup" # Set up gems listed in the Gemfile.
require "bootsnap/setup" # Speed up boot time by caching expensive operations.
