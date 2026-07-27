module Api
  module V1
    module Cards
      # The Cards domain (ADR-0010, #317): Eira's push webhook. Service-to-
      # service only — a shared token, never a user session and never a
      # per-user credential. odt-ville holds no Jira token and calls no Jira
      # API; Eira pre-resolves the card and we see only { title, status, url }.
      class EventsController < ApplicationController
        # The three fields the contract promises, and nothing else — the
        # payload crosses a trust boundary, so what reaches the browser is
        # exactly these, as strings.
        FIELDS = %w[title status url].freeze

        # POST /api/v1/cards/event
        # { "email": "a@odds.team", "card": { title, status, url } | null }
        def create
          return head :unauthorized unless service_token?

          user = ::Auth::User.find_by(email: params[:email].to_s.downcase)
          # Eira pushes for everyone it tracks, not just people in the world.
          # An email we don't know is a quiet no-op, never an error.
          relay(user, card_param) if user
          head :no_content
        end

        private

        # Hold it, then tell whoever is already looking. Both halves are plain
        # writes — no job, no query — so Eira gets its 2xx in milliseconds,
        # nowhere near the 10s it aborts at.
        def relay(user, card)
          ::Cards::Registry.put(user.external_id, card)
          ActionCable.server.broadcast(
            PresenceChannel::CARD_STREAM,
            { type: "card", userId: user.external_id, card: card }
          )
        end

        # Fails closed: an unconfigured token leaves `expected` blank, and no
        # presented token can match it.
        def service_token?
          expected = ENV["ODT_VILLE_INGEST_TOKEN"].to_s
          expected.present? &&
            ActiveSupport::SecurityUtils.secure_compare(expected, bearer_token.to_s)
        end

        def card_param
          raw = params[:card]
          return nil unless raw.respond_to?(:to_unsafe_h)

          FIELDS.index_with { |field| raw[field].to_s }
        end
      end
    end
  end
end
