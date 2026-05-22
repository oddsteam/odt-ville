# Be sure to restart your server when you modify this file.
#
# Allow the React dev server (Vite) to call this API directly.
# The frontend also proxies /api -> :3000 in development, so this is mainly a
# safety net for when the frontend is run without the proxy.
#
# Read more: https://github.com/cyu/rack-cors

Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "localhost:5390", "127.0.0.1:5390"

    resource "*",
      headers: :any,
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
