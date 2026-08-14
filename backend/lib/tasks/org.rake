# A rake task, not a client and not a cron (ADR-0016): talent.odds.team issues
# no service credential — only a 7-day user-scoped JWT — so the export is pulled
# by hand and loaded from db/talent_employees.json, which is gitignored because
# this repo is public. Expected to be deleted when the employee-directory
# service's queue consumer replaces it.
namespace :org do
  desc "Load the talent.odds.team roster export into org_employees (#388)"
  task import_roster: :environment do
    puts Org::RosterImport.run
  end
end
