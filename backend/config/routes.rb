Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      # Communities CRUD (reusable surface — no spatial / game concepts).
      resources :communities, only: [:index, :show, :create, :update, :destroy]

      # Current viewer (user + company).
      get "me", to: "me#show"

      # Content feed + per-item read/ack state.
      get  "content_items/feed", to: "content_items#feed"
      post "content_items/:id/open", to: "content_items#open"
      post "content_items/:id/acknowledge", to: "content_items#acknowledge"

      # Village game session — spawn point + last visited (game-only).
      get  "game/session", to: "game_sessions#show"
      put  "game/session", to: "game_sessions#update"

      # Posture-login entry gate (issue #24). start kicks off a Verification for
      # a gated house; confirm reads its result server-to-server to open the door.
      post "game/posture/start", to: "posture#start"
      post "game/posture/confirm", to: "posture#confirm"
      # Admin proxy (issue #38): the live posture-set catalog for the gate picker.
      # client_secret stays server-side; the browser only sees [{ id, name }].
      get  "game/posture/sets", to: "posture#sets"

      # Character sprite manifests — saved by the sprite-mapper tool, read by
      # the game/preview. `active` is the single live character.
      resources :character_manifests, only: [:index, :create, :show] do
        get :active, on: :collection
      end

      # Tile objects — trees/props cropped from an atlas in the tile-object
      # mapper, rendered on the town map. `active?kind=` is the live one.
      resources :tile_objects, only: [:index, :create, :show, :destroy] do
        get :active, on: :collection
        post :activate, on: :member
        post :deactivate, on: :member
      end

      # Ground tiles — grass/road/… cells tagged in the ground-tile mapper by
      # their atlas coordinate, drawn via the tilemap renderer. A flat catalog
      # (no single-active); edge/corner autotiling comes later.
      resources :ground_tiles, only: [:index, :create, :destroy]
    end
  end
end
