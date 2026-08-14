require "base64"
require "open-uri"

module Api
  module V1
    module Org
      # The Basecamp roster as a name-search the operator picks from (#392), when
      # email couldn't join an employee to their face. Fetched server-side through
      # Basecamp::Client — the roster is never handed to the browser wholesale, and
      # the signed avatar URL never leaves the backend (ADR-0012): each hit's face
      # rides back as inlined bytes.
      class BasecampPeopleController < BaseController
        before_action -> { require_role!("admin") }

        # Injectable seams, like AvatarsController.fetcher: the client so the
        # OAuth dance is stubbed at the boundary, the fetcher so the avatar bytes
        # are too. Built per request — a client is cheap and holds one access token.
        class_attribute :client_factory, instance_writer: false,
          default: -> { ::Basecamp::Client.from_env }
        class_attribute :fetcher, instance_writer: false,
          default: ->(url) {
            io = URI.parse(url).open
            [ io.read, io.content_type ]
          }

        def self.reset_seams!
          self.client_factory = -> { ::Basecamp::Client.from_env }
          self.fetcher = ->(url) {
            io = URI.parse(url).open
            [ io.read, io.content_type ]
          }
        end

        # GET /api/v1/org/basecamp_people?q= — name matches, each with an inlined
        # avatar so the operator confirms by face. A short query returns nothing:
        # the point is to narrow ~514 people to a handful, not to dump the roster.
        def index
          query = params[:q].to_s.strip.downcase
          return render json: [] if query.length < 2

          hits = roster.select { |p| p["name"].to_s.downcase.include?(query) }.first(RESULT_CAP)
          render json: hits.map { |p| { id: p["id"], name: p["name"], avatar: avatar_data_uri(p["avatar_url"]) } }
        end

        private

        # ponytail: a handful of matches per search; cap keeps the per-request
        # avatar fetches bounded. Raise it if the operators ask for more at once.
        RESULT_CAP = 12

        # Cached so fast typing doesn't re-walk Basecamp's pages per keystroke and
        # blow the 50/10s token limit; the roster barely moves. null_store in test.
        def roster
          Rails.cache.fetch("basecamp:roster", expires_in: 5.minutes) { client.get("people.json") }
        end

        def client
          self.class.client_factory.call
        end

        # The signed URL stays server-side; the browser gets the rendered bytes.
        # A face that won't fetch is not an error — the candidate shows nameless.
        def avatar_data_uri(url)
          return nil if url.blank?

          bytes, type = self.class.fetcher.call(url)
          bytes && "data:#{type || 'image/jpeg'};base64,#{Base64.strict_encode64(bytes)}"
        rescue StandardError
          nil
        end
      end
    end
  end
end
