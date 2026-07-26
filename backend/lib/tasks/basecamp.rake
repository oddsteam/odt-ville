# ponytail: a rake task, not a scheduled job — the roster moves a few times a
# year and a re-run is cheap (ADR-0012). Schedule it when someone is tired of
# running it.
namespace :basecamp do
  desc "Copy Basecamp avatars onto users with a matching email (#321)"
  task avatars: :environment do
    puts Basecamp::AvatarSync.run
  end
end
