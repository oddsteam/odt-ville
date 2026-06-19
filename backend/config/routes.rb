Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      # Communities CRUD (reusable surface — no spatial / game concepts).
      resources :communities, only: [:index, :show, :create, :destroy]

      # Current viewer (user + company).
      get "me", to: "me#show"

      # Content feed + per-item read/ack state.
      get  "content_items/feed", to: "content_items#feed"
      post "content_items/:id/open", to: "content_items#open"
      post "content_items/:id/acknowledge", to: "content_items#acknowledge"

      # Village game session — spawn point + last visited (game-only).
      get  "game/session", to: "game_sessions#show"
      put  "game/session", to: "game_sessions#update"

      # Character sprite manifests — saved by the sprite-mapper tool, read by
      # the game/preview. `active` is the single live character.
      resources :character_manifests, only: [:index, :create, :show] do
        get :active, on: :collection
      end

      # Tile objects — trees/props cropped from an atlas in the tile-object
      # mapper, rendered on the town map. `active?kind=` is the live one.
      resources :tile_objects, only: [:index, :create] do
        get :active, on: :collection
      end
    end
  end
end
