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
        resources :character_manifests, only: [:index, :create, :show] do
          get :active, on: :collection
          # Per-user selection (#155, ADR-0009): for_me resolves the caller's
          # pick -> global active; select persists the caller's pick.
          get :for_me, on: :collection
          post :select, on: :member
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

        # Ground tiles — grass/road/… cells tagged in the ground-tile mapper by
        # their atlas coordinate, drawn via the tilemap renderer. A flat catalog
        # (no single-active); edge/corner autotiling comes later.
        resources :ground_tiles, only: [:index, :create, :destroy]

        # Terrains — per-terrain stack priority (#120). Read the seam-ownership
        # order both ground producers resolve against; `order` reorders it (admin).
        get "terrains", to: "terrains#index"
        put "terrains/order", to: "terrains#reorder"
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
    end
  end
end
