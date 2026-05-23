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
    end
  end
end
