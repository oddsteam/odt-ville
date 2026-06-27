module Api
  module V1
    # The posture-login entry gate (issue #24). Holds the client_secret
    # server-side and runs the two server-to-server calls; the browser only ever
    # opens the hosted_url and reports back a session_id. Once-per-session is a
    # shell concern — a pass is not persisted here, so each session re-verifies.
    class PostureController < BaseController
      GATE = "posture-login".freeze

      # POST /api/v1/game/posture/start — body { community_id, callback_url }.
      # Looks up the house's posture_set_id and starts a Verification, returning
      # the hosted_url the shell opens plus the one-time session_id.
      def start
        house = current_user.company.houses.active.find(params[:community_id])

        unless house.entry_gate == GATE && house.posture_set_id.present?
          return render json: { error: "House is not posture-gated" }, status: :unprocessable_entity
        end

        callback_url = params[:callback_url].to_s
        unless absolute_http_url?(callback_url)
          return render json: { error: "callback_url must be an absolute http(s) URL" }, status: :unprocessable_entity
        end

        session = PostureLogin::Client.from_env.start_verification(
          posture_set_id: house.posture_set_id,
          callback_url: callback_url
        )
        render json: session, status: :created
      end

      # POST /api/v1/game/posture/confirm — body { session_id }. Reads the
      # result server-to-server; the gate opens only on a confirmed pass.
      def confirm
        result = PostureLogin::Client.from_env.read_result(session_id: params[:session_id].to_s)
        render json: { granted: PostureLogin::Client.granted?(**result), status: result[:status] }
      end

      private

      def absolute_http_url?(value)
        uri = URI.parse(value)
        uri.is_a?(URI::HTTP) && uri.host.present?
      rescue URI::InvalidURIError
        false
      end
    end
  end
end
