Rails.application.routes.draw do
  # Reveal health status on /up that returns 200 if the app boots with no exceptions, otherwise 500.
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      # Town map: company, houses, board summaries, counts, spawn point, daily brief.
      get "village", to: "village#show"

      # House interior (show) + admin add/remove a community.
      resources :houses, only: [:show, :create, :destroy]

      # Content interaction.
      post "content_items/:id/open", to: "content_items#open"
      post "content_items/:id/acknowledge", to: "content_items#acknowledge"

      # Last known location (last_area / last_house_id / last_room only — never x/y).
      put "me/location", to: "locations#update"
    end
  end
end
