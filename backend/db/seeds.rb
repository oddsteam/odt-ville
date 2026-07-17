# ODT Ville seed data.
#
# Creates one company, one user, and five "community houses", each with the
# three standard boards (Must Know / Should Know / Nice to Know) and example
# content. Re-runnable: it clears the village tables first.
#
#   bin/rails db:seed

now = Time.current

# House blueprints. position_order is assigned automatically from array order;
# logo_url is left blank so the frontend uses an offline category emoji.
HOUSES = [
  {
    title: "Compliance House",
    color: "#C0392B",
    category_key: "compliance",
    boards: {
      must_know: [
        {
          title: "Updated AML transaction reporting threshold",
          summary: "Cash transactions above the new limit must be reported the same day.",
          body: "Effective immediately, the same-day reporting threshold for cash transactions has been lowered. Any single cash transaction at or above the new limit must be filed before end of business. When in doubt, file it — over-reporting is not a finding, under-reporting is.",
          priority: "urgent",
          requires_ack: true,
          effective_from: now - 21.days,
          expires_at: nil
        },
        {
          title: "Q2 compliance attestation due",
          summary: "All branch staff must complete the quarterly attestation form.",
          body: "The Q2 attestation confirms you have reviewed the current policy set. It takes about ten minutes. Your branch manager can see completion status, so please do not leave it to the last day.",
          priority: "important",
          requires_ack: true,
          effective_from: now - 7.days,
          expires_at: now + 21.days
        }
      ],
      should_know: [
        {
          title: "Refreshed sanctions screening checklist",
          summary: "The screening checklist has three new steps for high-risk regions.",
          body: "The sanctions screening checklist has been updated. The new steps mostly affect onboarding for customers with addresses in high-risk regions. The checklist is linked from the onboarding tool.",
          priority: "important",
          requires_ack: false,
          effective_from: now - 10.days,
          expires_at: nil
        },
        {
          title: "New customer ID verification steps",
          summary: "A short change to how secondary ID is recorded.",
          body: "Secondary ID details are now recorded in a structured field rather than free text. This makes later review much faster. No change to which documents are acceptable.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 5.days,
          expires_at: nil
        }
      ],
      nice_to_know: [
        {
          title: "Compliance team office hours",
          summary: "Drop-in office hours every Wednesday afternoon.",
          body: "The compliance team holds open office hours every Wednesday from 2pm. Bring real cases — it is the fastest way to get a clear answer.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 30.days,
          expires_at: nil
        },
        {
          title: "Glossary: common compliance acronyms",
          summary: "A plain-language glossary of the acronyms you will hear most.",
          body: "AML, KYC, CDD, SAR, PEP — the glossary explains each one in a sentence, with an example. Handy for new joiners.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 60.days,
          expires_at: nil
        }
      ]
    }
  },
  {
    title: "Product House",
    color: "#2E86C1",
    category_key: "product",
    boards: {
      must_know: [
        {
          title: "Core banking release 8.4 ships Monday",
          summary: "Expect a new layout on the accounts screen from Monday morning.",
          body: "Release 8.4 reaches all branches Monday. The most visible change is a redesigned accounts screen — same data, clearer grouping. A two-minute walkthrough is on the Should Know board.",
          priority: "important",
          requires_ack: false,
          effective_from: now - 2.days,
          expires_at: now + 14.days
        },
        {
          title: "Legacy quick-quote tool is being retired",
          summary: "The old quick-quote tool stops working at the end of the month.",
          body: "The legacy quick-quote tool will be switched off at month end. Use the new pre-approval flow instead — it produces the same numbers and saves the quote to the customer record automatically.",
          priority: "important",
          requires_ack: false,
          effective_from: now - 6.days,
          expires_at: now + 25.days
        }
      ],
      should_know: [
        {
          title: "New mortgage pre-approval flow walkthrough",
          summary: "A short walkthrough of the replacement pre-approval flow.",
          body: "The new pre-approval flow asks for the same information in a more logical order and validates inputs as you go. The walkthrough covers the three screens and the one place people commonly get stuck.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 4.days,
          expires_at: nil
        }
      ],
      nice_to_know: [
        {
          title: "Roadmap teaser: unified customer dashboard",
          summary: "A peek at what the product team is exploring next.",
          body: "Early design work has started on a unified customer dashboard that brings accounts, products and recent contact onto one screen. Nothing is committed yet — feedback is welcome.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 12.days,
          expires_at: nil
        },
        {
          title: "Where to send product feedback",
          summary: "The product team reads every submission to the feedback channel.",
          body: "If something in the product slows you or a customer down, the feedback channel is the place to say so. Concrete examples beat general complaints.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 40.days,
          expires_at: nil
        }
      ]
    }
  },
  {
    title: "Branch Ops House",
    color: "#1E8449",
    category_key: "branch_ops",
    boards: {
      must_know: [
        {
          title: "Saturday hours change for the holiday weekend",
          summary: "Branches open late and close early this Saturday only.",
          body: "For the holiday weekend, all branches open at 10am and close at 1pm this Saturday. Normal hours resume the following week. Please update any printed signage at your branch.",
          priority: "urgent",
          requires_ack: false,
          effective_from: now - 2.days,
          expires_at: now + 5.days
        },
        {
          title: "Cash drawer reconciliation: new cutoff time",
          summary: "Drawer reconciliation now closes 30 minutes earlier.",
          body: "To give the back office more processing time, the daily cash drawer reconciliation cutoff has moved 30 minutes earlier. Build it into your end-of-day routine so nothing is rushed.",
          priority: "important",
          requires_ack: true,
          effective_from: now - 3.days,
          expires_at: nil
        }
      ],
      should_know: [
        {
          title: "Updated branch opening checklist",
          summary: "Two items added to the morning opening checklist.",
          body: "The opening checklist now includes a quick check of the self-service machines and confirmation that the overnight deposit box was cleared. Both take under a minute.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 8.days,
          expires_at: nil
        }
      ],
      nice_to_know: [
        {
          title: "Facilities request portal",
          summary: "Report a broken chair, flickering light or HVAC issue here.",
          body: "Anything physical in the branch — furniture, lighting, heating, signage — goes through the facilities request portal. Photos help the facilities team triage faster.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 50.days,
          expires_at: nil
        }
      ]
    }
  },
  {
    title: "Learning House",
    color: "#8E44AD",
    category_key: "learning",
    boards: {
      must_know: [
        {
          title: "Annual security awareness training is open",
          summary: "Everyone must complete the annual security training this quarter.",
          body: "The annual security awareness training is now open. It is about 45 minutes and covers phishing, social engineering and clean-desk practice. It is mandatory and tracked against your record.",
          priority: "important",
          requires_ack: true,
          effective_from: now - 9.days,
          expires_at: now + 30.days
        }
      ],
      should_know: [
        {
          title: "New micro-course: explaining APR to customers",
          summary: "A ten-minute course on talking customers through APR clearly.",
          body: "This short course gives you a plain, accurate way to explain APR without jargon. Useful refresher even if you do it every day.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 6.days,
          expires_at: nil
        },
        {
          title: "Certification renewal windows",
          summary: "Check when your role's certifications are due for renewal.",
          body: "Renewal windows differ by role. The learning portal shows your personal due dates — set a reminder a month ahead so a renewal never lapses.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 20.days,
          expires_at: nil
        }
      ],
      nice_to_know: [
        {
          title: "Book club pick of the month",
          summary: "This month's optional book club selection and meeting time.",
          body: "The internal book club meets on the last Friday of the month. This month's pick is about decision-making under uncertainty. Everyone is welcome, reading optional.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 15.days,
          expires_at: now + 15.days
        }
      ]
    }
  },
  {
    title: "Community Lounge",
    color: "#E67E22",
    category_key: "community",
    boards: {
      must_know: [
        {
          title: "Company town hall this Thursday",
          summary: "Quarterly town hall on Thursday — a recording will follow.",
          body: "The quarterly town hall is on Thursday. Leadership will cover results and answer submitted questions. If you cannot attend, a recording will be posted here afterwards.",
          priority: "important",
          requires_ack: false,
          effective_from: now - 1.day,
          expires_at: now + 6.days
        }
      ],
      should_know: [
        {
          title: "Volunteer day sign-up is open",
          summary: "Pick a local volunteering project for the company volunteer day.",
          body: "Sign-up for the annual volunteer day is open. Several local projects are listed — places are limited, so add your name early.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 5.days,
          expires_at: now + 20.days
        }
      ],
      nice_to_know: [
        {
          title: "Welcome our new branch teammates",
          summary: "Say hello to the people who joined this month.",
          body: "A warm welcome to everyone who started this month across the branches. Their photos and a sentence about each are on the community board.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 7.days,
          expires_at: nil
        },
        {
          title: "Photo wall: best branch setups",
          summary: "Share a photo of your branch's display or community corner.",
          body: "The photo wall collects pictures of branch displays, community corners and seasonal decorations. It is purely for fun — add yours any time.",
          priority: "normal",
          requires_ack: false,
          effective_from: now - 25.days,
          expires_at: nil
        }
      ]
    }
  }
].freeze

# A trivial authored map fixture (issue #78) — a fixed grass grid plus a couple
# of props, baked (ADR-0003) so the runtime blits it with no autotiling. This is
# the second producer of the runtime map shape (ADR-0004); it is fetched at
# GET /api/v1/maps/atrium and rendered at /maps/atrium in the app. The grass
# cell and prop frames reference the bundled `1_Terrains_and_Fences_32x32`
# tileset served from public/maps/tilesets.
MAP_TILESET = "1_Terrains_and_Fences_32x32".freeze
MAP_GRASS_FRAME = 0 # top-left grass cell of the terrain tileset
MAP_COLS = 8
MAP_ROWS = 6
MAP_FIXTURE = {
  slug: "atrium",
  title: "The Atrium",
  cols: MAP_COLS,
  rows: MAP_ROWS,
  baked: {
    "tilesets" => [{ "name" => MAP_TILESET, "cell" => 32 }],
    # Row-major grid, every cell the same baked grass tile.
    "tiles" => Array.new(MAP_ROWS) {
      Array.new(MAP_COLS) { { "tileset" => MAP_TILESET, "frame" => MAP_GRASS_FRAME } }
    },
    # A couple of hand-placed props to prove placement renders over the ground.
    "entities" => [
      { "kind" => "prop", "tileset" => MAP_TILESET, "frame" => 41, "x" => 2, "y" => 2 },
      { "kind" => "prop", "tileset" => MAP_TILESET, "frame" => 41, "x" => 5, "y" => 3 }
    ]
  }
}.freeze

ActiveRecord::Base.transaction do
  puts "Clearing existing village data..."
  Viewer::UserContentState.delete_all
  GameSession::UserLocationState.delete_all
  Communities::ContentItem.delete_all
  Communities::Board.delete_all
  Communities::House.delete_all
  Auth::User.delete_all
  Org::Company.delete_all
  Maps::Map.delete_all

  company = Org::Company.create!(name: "ODT")

  # Seeded users mirror the Keycloak realm (keycloak/realm-export.json): their
  # external_id pins to the realm's seeded subject UUIDs so a verified token for
  # alice/bob/carol resolves to the matching local user (issue #92).
  SEED_USERS = [
    { name: "Alice Rivera", external_id: "11111111-1111-1111-1111-111111111111", role: "branch_employee" },
    { name: "Bob Chen",     external_id: "22222222-2222-2222-2222-222222222222", role: "branch_employee" },
    { name: "Carol Diaz",   external_id: "33333333-3333-3333-3333-333333333333", role: "branch_manager" }
  ].freeze

  SEED_USERS.each do |attrs|
    u = Auth::User.create!(company: company, name: attrs[:name], role: attrs[:role], external_id: attrs[:external_id])
    GameSession::UserLocationState.create!(user: u, company: company, last_area: "town")
  end

  HOUSES.each_with_index do |house_data, index|
    house = company.houses.create!(
      title: house_data[:title],
      color: house_data[:color],
      logo_url: "",
      category_key: house_data[:category_key],
      position_order: index + 1,
      active: true
    )

    house_data[:boards].each do |board_type, items|
      board = house.boards.create!(board_type: board_type)
      items.each { |attrs| board.content_items.create!(attrs.merge(active: true)) }
    end
  end

  Maps::Map.create!(MAP_FIXTURE)

  # Terrain stack priority (#120), low→high: the higher-priority terrain owns a
  # shared seam. This is the order both ground producers (the generated town and
  # the authored-map editor) resolve their Tile Catalog against — data now, not a
  # hardcoded stack. Upserted so a re-seed keeps any author reorder intact for
  # already-present names while filling in the canonical defaults.
  %w[water road sand dirt grass].each_with_index do |name, priority|
    Catalog::Terrain.find_or_create_by!(name: name) { |t| t.priority = priority }
  end

  puts "Seeded: #{Org::Company.count} company, #{Auth::User.count} users, " \
       "#{Communities::House.count} houses, #{Communities::Board.count} boards, #{Communities::ContentItem.count} content items, " \
       "#{Maps::Map.count} authored map."
end
