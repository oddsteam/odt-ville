Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  # Dev-only staleness signal (issue #225): has HEAD moved since this server
  # booted? Surfaced on the frontend ArchScoreBar. See the dev_staleness
  # initializer. Under /api so the Vite proxy reaches it; no auth — dev env
  # only, and it exposes nothing but commit shas.
  if Rails.env.development?
    get "api/v1/dev/staleness", to: ->(_env) {
      [200, { "content-type" => "application/json" }, [DevStaleness.report.to_json]]
    }
  end

  # Presence multiplayer (#88): the WebSocket endpoint, under /api so the Vite
  # proxy (dev and homeserver preview) reaches it with no extra routing rule.
  mount ActionCable.server => "/api/cable"

  namespace :api do
    namespace :v1 do
      # The Communities domain (ADR-0010) — controllers under
      # Api::V1::Communities::, URLs unchanged (`scope module:` nests the
      # controller, not the path).
      scope module: :communities do
        # Communities CRUD (reusable surface — no spatial / game concepts).
        resources :communities, only: [:index, :show, :create, :update, :destroy]

        # Content feed + per-item read/ack state.
        get  "content_items/feed", to: "content_items#feed"
        post "content_items/:id/open", to: "content_items#open"
        post "content_items/:id/acknowledge", to: "content_items#acknowledge"
      end

      # The Viewer domain (ADR-0010) — the `me` controller under
      # Api::V1::Viewer::, URL unchanged (`scope module:` nests the controller).
      scope module: :viewer do
        # Current viewer (user + company).
        get "me", to: "me#show"
      end

      # The Auth domain (ADR-0010) — controller under Api::V1::Auth::. The
      # stable avatar path (#320, ADR-0012), keyed by the Keycloak subject so
      # the header and the multiplayer peers (#323) share one URL shape.
      scope module: :auth do
        get "users/:external_id/avatar", to: "avatars#show"
        # The admin roster (#430): every login with its role badges, tagged by
        # source (App grant vs the caller's own Keycloak realm role). The URL
        # sits under /admin because it is admin-console chrome, not an identity
        # read; `scope module: :auth` nests the controller, not the path.
        get "admin/users", to: "users#index"
        # Client onboarding (#500): pre-provision a user by email, and edit
        # `external` / `client_site` on an existing one. Admin-gated; reuses the
        # users console, no separate /admin/clients route.
        post "admin/users", to: "users#create"
        patch "admin/users/:id", to: "users#update"
        # Grant an App role from the console (#431): admin-gated, stamps the
        # acting admin as granted_by. Only `admin` is grantable for now.
        post "admin/users/:id/roles", to: "roles#create"
        # Revoke an App role (#432): admin-gated. Refuses self-revoke (422) so an
        # admin can't lock themselves out, and 404s a role the user does not hold
        # as an App grant — a Keycloak-only admin cannot be silently "revoked".
        delete "admin/users/:id/roles/:role", to: "roles#destroy"
      end

      # The GameSession domain (ADR-0010) — controller under
      # Api::V1::GameSession::, URLs unchanged.
      scope module: :game_session do
        # Village game session — spawn point + last visited (game-only).
        get  "game/session", to: "game_sessions#show"
        put  "game/session", to: "game_sessions#update"
      end

      # The Posture domain (ADR-0010) — controller under Api::V1::Posture::,
      # URLs unchanged.
      scope module: :posture do
        # Posture-login entry gate (issue #24). start kicks off a Verification for
        # a gated house; confirm reads its result server-to-server to open the door.
        post "game/posture/start", to: "posture#start"
        post "game/posture/confirm", to: "posture#confirm"
        # Admin proxy (issue #38): the live posture-set catalog for the gate picker.
        # client_secret stays server-side; the browser only sees [{ id, name }].
        get  "game/posture/sets", to: "posture#sets"
      end

      # The Character domain (ADR-0010) — controller under Api::V1::Character::,
      # URLs unchanged.
      scope module: :character do
        # Character sprite manifests — saved by the sprite-mapper tool, read by
        # the game/preview. `active` is the single live character.
        resources :character_manifests, only: [:index, :create, :show, :update, :destroy] do
          get :active, on: :collection
          # Per-user selection (#155, ADR-0009): for_me resolves the caller's
          # pick -> global active; select persists the caller's pick.
          get :for_me, on: :collection
          post :select, on: :member
          # Personal Looks (#398, ADR-0017): any authenticated user saves one.
          post :looks, on: :collection
        end
      end

      # The Catalog domain (ADR-0010) — controllers under Api::V1::Catalog::,
      # URLs unchanged (`scope module:` nests the controller, not the path).
      scope module: :catalog do
        # Tile objects — trees/props cropped from an atlas in the tile-object
        # mapper, rendered on the town map. `active?kind=` is the live one.
        resources :tile_objects, only: [:index, :create, :show, :destroy] do
          get :active, on: :collection
          post :activate, on: :member
          post :deactivate, on: :member
        end

        # Monsters — the weighted wild-encounter pool, authored in the monster
        # admin. Probability per monster = its rate / sum(enabled rates).
        resources :monsters, only: [:index, :show, :create, :update, :destroy] do
          # The live wild-encounter pool: enabled monsters with their sprite image,
          # for the in-game grass roll (the roster `index` omits the heavy blob).
          get :pool, on: :collection
        end

        # NPCs — the catalog of placed characters (#259, ADR-0008): identity a
        # trainer Zone payload resolves by id. The list feeds the decorate
        # editor's picker, the runtime and the NPC admin's roster; the writes
        # (#260) are how that picker gets anything to offer.
        resources :npcs, only: [:index, :create, :update, :destroy]

        # Ground tiles — grass/road/… cells tagged in the ground-tile mapper by
        # their atlas coordinate, drawn via the tilemap renderer. A flat catalog
        # (no single-active); edge/corner autotiling comes later.
        resources :ground_tiles, only: [:index, :create, :destroy]

        # Terrains — per-terrain stack priority (#120). Read the seam-ownership
        # order both ground producers resolve against; `order` reorders it (admin).
        get "terrains", to: "terrains#index"
        put "terrains/order", to: "terrains#reorder"
      end

      # The Cards domain (ADR-0010, #317) — controller under Api::V1::Cards::.
      # Eira's push webhook: a card change for one person, authed by a shared
      # service token. Not under the user-session gate — it is the only
      # service-to-service surface in the API.
      scope module: :cards do
        post "cards/event", to: "events#create"
      end

      # The Voice domain (ADR-0011, #308) — controller under Api::V1::Voice::.
      # Mints a LiveKit room token for the connecting user; the room derives
      # from the map. The api secret is read from env and never leaves the
      # server — no token is ever minted in the browser.
      scope module: :voice do
        get "voice/token", to: "voice_tokens#show"
      end

      # The Org domain (ADR-0010, #388) — the roster read-model (ADR-0016).
      # Read-only and admin-gated: assignment happens upstream, and offering
      # edits here would create changes the next sync silently destroys.
      scope module: :org do
        get "org/employees", to: "employees#index"
        # The one write this read-model allows (#392): a human sets the Basecamp
        # link email can't. Scoped to that column in the controller, admin-gated.
        patch "org/employees/:id", to: "employees#update"
        get "org/basecamp_people", to: "basecamp_people#index"
      end

      # The Maps domain (ADR-0010) — controllers under Api::V1::Maps::, URLs
      # unchanged (`scope module:` nests the controller, not the path).
      scope module: :maps do
        # Maps — the authored-map contract (ADR-0004). `:slug` loads a baked map
        # for play; `index`/`create`/`update` are the editor's write half (#105),
        # admin-gated. `index` powers the map picker that decouples collision
        # painting from create; `update` saves a re-painted collision mask.
        get "maps", to: "maps#index"
        get "maps/:slug", to: "maps#show"
        post "maps", to: "maps#create"
        patch "maps/:slug", to: "maps#update"
      end

      # The Standees domain (ADR-0010, ADR-0015): peer-to-peer cutouts read
      # alongside a map, never baked into it. Nested under the map slug so both
      # endpoints inherit that map's access gate (#83). `index` returns the
      # Standees on the map; `create` deploys one at the caller's current cell.
      scope module: :standees do
        get "maps/:slug/standees", to: "standees#index"
        post "maps/:slug/standees", to: "standees#create"
        # The caller's own Standees across every map, for the world-wide budget
        # of 3 (#371) — not scoped to a map, so it carries no slug.
        get "standees/mine", to: "standees#mine"
        # Pick up a Standee (#370): the owner takes their own cutout back, which
        # frees a slot at once. Keyed by the Standee id, not the map slug — a
        # Standee is picked up by identity, and only its owner may (checked in
        # the action, since roles live in the caller's JWT, not our DB — #279).
        delete "standees/:id", to: "standees#destroy"
      end
    end
  end
end
