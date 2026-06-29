ENV["RAILS_ENV"] ||= "test"
require_relative "../config/environment"
require "rails/test_help"

# The suite has no running Keycloak, so we stub the bearer-token resolver
# instead of minting real JWTs: the token *is* the user's external_id (#92).
# KeycloakAuthenticator itself is exercised directly in its own unit test.
ApplicationController.subject_resolver = ->(token) { token }

module ApiTestHelpers
  BOARD_TYPES = %w[must_know should_know nice_to_know].freeze

  # A fresh company + user pair — gives every test isolated data and makes
  # cross-company scoping trivial to verify. Each user gets a unique external_id
  # so the stubbed resolver can authenticate it via `auth(user)`.
  def setup_company(name: "Co", user_name: "Test User", role: "branch_employee")
    company = Company.create!(name: name)
    user = company.users.create!(name: user_name, role: role, external_id: SecureRandom.uuid)
    [company, user]
  end

  # Build a community with the standard three boards. Pass `with_welcome: true`
  # to drop a single Must Know content item on it.
  def make_community(company:, title: "Community", category: "community", with_welcome: false)
    community = company.houses.create!(
      title: title,
      color: "#888888",
      logo_url: "",
      category_key: category,
      position_order: (company.houses.maximum(:position_order) || 0) + 1,
      active: true
    )
    BOARD_TYPES.each { |bt| community.boards.create!(board_type: bt) }
    if with_welcome
      community.boards.find_by(board_type: "must_know").content_items.create!(
        title: "Welcome to #{title}",
        priority: "normal",
        requires_ack: false,
        active: true,
        effective_from: Time.current
      )
    end
    community
  end

  def make_item(board:, title: "Item", priority: "normal", requires_ack: false, active: true, effective_from: Time.current, expires_at: nil)
    board.content_items.create!(
      title: title,
      priority: priority,
      requires_ack: requires_ack,
      active: active,
      effective_from: effective_from,
      expires_at: expires_at
    )
  end

  # Auth: the API resolves current_user from a `Authorization: Bearer <jwt>`
  # header. With the stubbed resolver the token is the user's external_id, so
  # this presents a token that authenticates as `user`.
  def auth(user)
    { "Authorization" => "Bearer #{user.external_id}" }
  end

  def json
    JSON.parse(response.body, symbolize_names: true)
  end
end

class ActiveSupport::TestCase
  # Tests run in their own transactions; rolling them back after each test
  # keeps the suite fast and isolated.
  self.use_transactional_tests = true
end

class ActionDispatch::IntegrationTest
  include ApiTestHelpers
end
