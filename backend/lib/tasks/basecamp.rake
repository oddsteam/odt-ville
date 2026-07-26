# A rake task, not an in-app job queue: the homeserver's crontab runs
# scripts/basecamp-avatar-sync.sh daily (#322, ADR-0012), which is the whole of
# "refresh" — a rotated avatar is picked up by running this again.
namespace :basecamp do
  desc "Copy Basecamp avatars onto users with a matching email (#321)"
  task avatars: :environment do
    puts Basecamp::AvatarSync.run
  end
end
