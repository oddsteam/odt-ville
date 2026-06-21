# ODT Ville

An MVP prototype of a playful, **top-down Pokémon Game Boy-style village** that
sits on top of an ordinary corporate-content app. An employee walks an avatar
around a tile town, visits repeated **community houses** (each a community /
communication channel), and reads three boards inside every house:

1. **Must Know**
2. **Should Know**
3. **Nice to Know**

> Design principle: _make the map feel playful, but keep the information
> architecture boring._ The village is only a navigation layer — the Daily Brief
> list mode is always available so the game never blocks access to content.

This is a **single-player prototype**. No multiplayer, no chat, no map editor,
no game engine — just plain React rendering over a Rails API, in a CSS tile grid.

> **Assets:** the Pokémon-GB font and the walking character sprites are borrowed
> from a local `pokemon-js` reference repo as prototype placeholders. The town
> tiles and buildings are CSS-drawn and tinted by each house's configured colour.

---

## Architecture

| Part        | Stack                              | Location    | Dev port |
|-------------|------------------------------------|-------------|----------|
| Backend     | Rails 8 API + PostgreSQL           | `backend/`  | `3130`   |
| Frontend    | React 19 + Vite (plain JSX)        | `frontend/` | `5390`   |

Ports `3130` (backend) and `5390` (frontend) are this project's allocations in
the shared POC `ports.json` registry. They are baked into `backend/config/puma.rb`
and `frontend/vite.config.js`, so the run commands below need no port flag.

The frontend talks to the API at `/api/v1`. In development, Vite proxies
`/api → http://localhost:3130`, so no CORS setup is needed (CORS is also enabled
on the backend as a safety net).

There is **no authentication** in this MVP — it is single-player, so the server
simply acts as the one seeded user. (An optional `X-User-Id` request header can
switch users for testing.)

---

## Prerequisites

- **Ruby 3.2+** (developed on 3.4.2). `backend/.ruby-version` is included, so
  rbenv/asdf users get the right version automatically.
- **Node 18+** (developed on Node 25).
- **PostgreSQL** running locally, reachable by your OS user (the default
  `config/database.yml` connects over the local socket with no password).

---

## Run everything with Docker Compose (local dev)

If you'd rather not install Ruby, Node, and Postgres locally, bring the whole
stack up with one command. You only need Docker Desktop.

```bash
docker compose up --build
```

This starts three services:

| Service    | URL                     | Notes                                            |
| ---------- | ----------------------- | ------------------------------------------------ |
| `db`       | `localhost:5432`        | Postgres 16, data persisted in the `pgdata` volume |
| `backend`  | `localhost:3190`        | Rails API; runs `db:prepare` (create+migrate+seed) on boot |
| `frontend` | `localhost:5460`        | Vite dev server (hot reload); proxies `/api` → `backend` |

Open <http://localhost:5460>. Editing files under `backend/` or `frontend/`
hot-reloads inside the containers (the source is bind-mounted).

Notes:

- **Dependencies live in named volumes** (`bundle`, `frontend_node_modules`),
  not on the host, so native gems and `sharp` are built for the Linux
  containers instead of macOS. You don't run `bundle install` / `pnpm install`
  yourself — the containers do it on first boot (so the first `up` is slow).
- **Data persists** across `docker compose down && docker compose up`. To wipe
  the database, use `docker compose down -v` (removes the `pgdata` volume).
- This is **dev only** — it uses `backend/Dockerfile.dev` and
  `frontend/Dockerfile.dev`. Production still deploys via the root
  `backend/Dockerfile` (Kamal/Thruster).
- **Encrypted credentials:** development doesn't need `RAILS_MASTER_KEY`. If the
  backend fails to boot complaining about credentials, drop your
  `config/master.key` into `backend/config/` (it's gitignored, never commit it).

Prefer running things natively? Keep reading.

---

## Homeserver deployment (Docker)

`https://odt-ville.p2d.uk` is served from the **homeserver** box, running this
same dev stack in Docker. Source is kept in sync from the Mac by **mutagen**
(`homeserver:apps/odt-ville`), so editing a file locally hot-reloads on the
homeserver inside the containers — no rebuild needed for code changes.

The homeserver uses the **base compose file only** (the `-f` flag skips
`compose.override.yaml`), so it publishes **only** the frontend port; the
backend and its own Postgres stay private on the compose network. The
Cloudflare tunnel forwards `odt-ville.p2d.uk` → `localhost:5460`.

```bash
# Deploy / restart the stack (run on the homeserver):
ssh homeserver 'cd ~/apps/odt-ville && docker compose -f compose.yaml up -d --build'
```

Day-to-day operations (all via `ssh homeserver 'cd ~/apps/odt-ville && ...'`):

| Task | Command |
| --- | --- |
| Status | `docker compose -f compose.yaml ps` |
| Logs (follow) | `docker compose -f compose.yaml logs -f backend` |
| Apply a **new migration** | `docker compose -f compose.yaml exec backend bin/rails db:migrate` |
| Pick up new **gems / pnpm deps** | `docker compose -f compose.yaml up -d --build` |
| Stop | `docker compose -f compose.yaml down` (add `-v` to also wipe the DB) |

Notes:

- **Code changes** sync via mutagen and hot-reload automatically. **New
  migrations do not auto-apply** (dev mode 500s with `PendingMigrationError`)
  — run the `db:migrate` command above, or restart the backend container.
- The stack has its **own Postgres container** (named `pgdata` volume), separate
  from the native Postgres other homeserver apps use. It's seeded on first boot.
- `restart: unless-stopped` means the stack comes back automatically after a
  reboot (Docker is enabled on boot).

---

## 1. Run the backend (Rails API)

```bash
cd backend
bundle install
bin/rails db:create db:migrate db:seed
bin/rails server
```

The API is now on **http://localhost:3130**.

> **If `bundle`/`rails` are "not found" or report an old Ruby**, your shell's
> active Ruby is too old. Activate Ruby 3.4.x first — e.g. with rbenv:
> `export PATH="$HOME/.rbenv/versions/3.4.2/bin:$PATH"` — then re-run the
> commands above.

### Seeding

`bin/rails db:seed` is **re-runnable** — it clears the village tables and
recreates them. It produces:

- 1 company — **ODT**
- 1 user — **Alex Rivera** (`branch_employee`)
- 5 houses — **Compliance House, Product House, Branch Ops House, Learning
  House, Community Lounge**
- 3 boards per house (Must / Should / Nice to Know) + 23 example content items

Run it again any time to reset all read/acknowledged state and location back to
a fresh start.

## 2. Run the frontend (React)

In a second terminal:

```bash
cd frontend
pnpm install
pnpm run dev
```

Open **http://localhost:5390**. (Keep the backend running — the frontend proxies
API calls to it.)

---

## Using the prototype

- **Move** — Arrow keys or **WASD** (4-direction tile walking). On touch screens,
  use the on-screen **D-pad**; the **A** button reads signs and enters houses.
- **Spawn** — first visit starts at the **Town Entrance** gate. After visiting a
  house, a reload spawns you back on its doormat. If that house was
  removed/deactivated, you fall back to the Town Entrance. You are never dropped
  straight into a board.
- **Urgent signage** — a red **!** badge appears on a house with unopened urgent
  Must-Know content. It is signage only — nothing is force-opened.
- **Enter a house** — walk up to a house and step into its doorway (or face the
  door and press **Enter** / tap **A**). Inside you see the house header and the
  three boards.
- **Read content** — open a board's cards. Each card shows title, summary,
  priority, effective/expiry dates, and acknowledgement status. Click **Open** to
  read the body; cards flagged _Acknowledgement Required_ also show an
  **Acknowledge** button.
- **Daily Brief** — the **📋 Daily Brief** button on the map opens a list of all
  Must-Know and urgent items across every house. This is the always-available
  fallback so the playful map never blocks important content.
- **Admin** — the **⚙ Admin** button opens a panel to **add or delete
  communities**. Adding one (name, category, roof colour, optional logo) creates
  a house with its three boards and drops a new building onto the map; deleting
  one removes its building. There is **no cap** — the town regenerates to fit
  the community count, with buildings wrapping onto new street rows (5 per row)
  as more are added.
- **Exit** — use the Exit door inside a house to return to the map; counts and
  badges refresh.

### Quick API smoke test

With the backend running:

```bash
curl -s localhost:3130/api/v1/village | python3 -m json.tool      # town + houses + brief
curl -s localhost:3130/api/v1/houses/1 | python3 -m json.tool     # a house and its 3 boards
curl -s -X POST localhost:3130/api/v1/content_items/1/open        # mark opened
curl -s -X POST localhost:3130/api/v1/content_items/1/acknowledge # mark acknowledged
curl -s -X PUT localhost:3130/api/v1/me/location \
  -H 'Content-Type: application/json' \
  -d '{"last_area":"house","last_house_id":2,"last_room":"must_know"}'
```

---

## Data model

| Model               | Purpose                                                            |
|---------------------|--------------------------------------------------------------------|
| `Company`           | Tenant.                                                            |
| `User`              | An employee (single-player; no auth).                              |
| `House`             | A community/channel — title, color, logo URL, category, order.     |
| `Board`             | One of `must_know` / `should_know` / `nice_to_know` per house.     |
| `ContentItem`       | A card — title, summary, body, priority, effective window, ack.    |
| `UserContentState`  | Per-user `unread` / `opened` / `acknowledged` state for an item.   |
| `UserLocationState` | Per-user **coarse** location: `last_area`, `last_house_id`,         |
|                     | `last_room` only — exact x/y is intentionally never stored.        |

Houses are laid out on the map **automatically** from `position_order`; admins
configure house metadata only (title, color, logo URL, category, visibility
placeholder) — never x/y coordinates.

## API endpoints

| Method & path                              | Purpose                                            |
|---------------------------------------------|----------------------------------------------------|
| `GET /api/v1/village`                       | Company, houses, board summaries, unread/urgent/ack counts, computed spawn point, and the Daily Brief list. |
| `GET /api/v1/houses/:id`                    | One house with its three boards and effective content items. |
| `POST /api/v1/content_items/:id/open`       | Mark an item opened for the current user.          |
| `POST /api/v1/content_items/:id/acknowledge`| Mark an item acknowledged.                         |
| `PUT /api/v1/me/location`                   | Save coarse location (`last_area` / `last_house_id` / `last_room`). |

---

## Intentionally out of scope (per the MVP brief)

- ❌ Multiplayer / shared presence
- ❌ Chat (a future extension could use Rails Action Cable)
- ❌ A custom map editor or admin-configurable map layout
- ❌ A game engine (Phaser etc.) — plain React DOM + a CSS tile grid
- ❌ Storing exact pixel `x/y` position
- ❌ Force-opening Must-Know content — the map only shows signage, and the
  Daily Brief is always available as a fallback list mode

## Project layout

```
gather-onerev/
├── backend/        Rails 8 API
│   ├── app/models/         Company, User, House, Board, ContentItem, …
│   ├── app/controllers/api/v1/   village, houses, content_items, locations
│   ├── app/serializers/    plain-hash JSON builders
│   ├── db/migrate/         7 migrations
│   └── db/seeds.rb         1 company · 1 user · 5 houses · content
├── frontend/       React + Vite
│   └── src/components/     VillageMap, HouseInterior, BoardPanel, ContentCard,
│                           HouseTile, PlayerAvatar, MobileDpad, SignBadge, …
└── README.md
```
