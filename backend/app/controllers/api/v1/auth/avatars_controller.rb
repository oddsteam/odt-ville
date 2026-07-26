require "open-uri"

module Api
  module V1
    module Auth
      # GET /api/v1/users/:external_id/avatar — our own name for "this person's
      # face" (ADR-0012). The stored `avatar_url` is a rotating signed capability
      # token, so it stays server-side and this endpoint streams the bytes.
      #
      # Deliberately token-free: an <img src> cannot carry a bearer header, and
      # the peer characters (#323) point at this same path. The key is the opaque
      # Keycloak subject presence frames already broadcast (#88).
      class AvatarsController < ApplicationController
        # Fetch seam, like ApplicationController.claims_resolver — request tests
        # swap it rather than reaching the network. open-uri follows the 302 to
        # the CDN object; the URL is ours (sync or hand-set), never user input.
        class_attribute :fetcher, instance_writer: false, default: ->(url) {
          io = URI.parse(url).open
          [ io.read, io.content_type ]
        }

        def show
          bytes, type = fetch(::Auth::User.find_by(external_id: params[:external_id])&.avatar_url)
          return head :not_found unless bytes

          send_data bytes, type: type || "image/jpeg", disposition: "inline"
        end

        private

        # No avatar, an unknown user and an upstream that won't answer are one
        # failure mode (ADR-0012): the caller falls back, nothing errors.
        def fetch(url)
          url && self.class.fetcher.call(url)
        rescue StandardError
          nil
        end
      end
    end
  end
end
