module Api
  module V1
    module Standees
      # The Standees runtime contract (#369, ADR-0015). Standees are NOT baked
      # into the map document — they are read alongside it here, and deployed by
      # a durable write. Both endpoints are scoped to a map by slug and inherit
      # that map's own access gate (the same #83 policy the map load uses); there
      # is no per-target authorization (#279 — roles live in the caller's JWT,
      # not our DB, so the server cannot authorize on another user's behalf).
      #
      # Leading-colon `::Standees::` reaches the domain module — inside
      # Api::V1::Standees a bare `Standees` would resolve to this namespace.
      class StandeesController < BaseController
        before_action :load_map, only: [:index, :create]

        # GET /api/v1/maps/:slug/standees — the Standees standing on this map.
        # Queried by map_id rather than through a reverse association, so the
        # dependency runs one way (Standees → Maps), never back.
        def index
          standees = ::Standees::Standee.live.where(map_id: @map.id)
                                        .includes(user: :character_manifest).order(:id)
          render json: standees.map { |s| ::Standees::StandeeSerializer.call(s, viewer: current_user) }
        end

        # POST /api/v1/maps/:slug/standees — deploy a Standee at the caller's
        # current cell. The server can't know where the avatar stands (position
        # is ephemeral, never persisted), so the client sends the cell it is on.
        # The Placard's caps and the multiplayer-only rule are invariants of the
        # record (#519), enforced by `create!` — a solo map or an over-long line
        # raises RecordInvalid, rendered as a 422 by the base controller.
        def create
          # The world-wide budget of 3 (#371): at the cap the deploy is refused
          # with a pointer to the Standees already out — never a silent replace.
          budget = ::Standees::Budget.for(current_user)
          unless budget.allows?
            return render json: { error: budget.refusal }, status: :unprocessable_entity
          end

          # The expiry window (#374): 7 days unless the owner said otherwise, and
          # never past 30. Refused rather than clamped — a Standee standing for a
          # week when its owner asked for a year is not what they deployed.
          expires_at = ::Standees::Standee.expiry_in(deploy_params[:expires_days])
          unless expires_at
            return render json: { error: "A Standee can stand for 1 to #{::Standees::Standee::MAX_DAYS} days" },
                          status: :unprocessable_entity
          end

          standee = ::Standees::Standee.create!(
            map: @map,
            user: current_user,
            cell_x: deploy_params[:x],
            cell_y: deploy_params[:y],
            message: deploy_params[:message],
            detail: deploy_params[:detail],
            reply_link: deploy_params[:reply_link],
            expires_at: expires_at
          )
          broadcast(@map.id, type: "standee:deploy", standee: ::Standees::StandeeSerializer.call(standee))
          render json: ::Standees::StandeeSerializer.call(standee, viewer: current_user), status: :created
        end

        # DELETE /api/v1/standees/:id — the owner picks up their own Standee
        # (#370). Only the owner may: there is no per-target authorization by
        # role (#279 — roles live in the caller's JWT, not our DB), so the one
        # check is "is this yours". Deleting the row frees a budget slot at once,
        # so the owner can redeploy immediately (the cap counts live rows, #371).
        def destroy
          standee = ::Standees::Standee.find(params[:id])
          unless standee.pickable_by?(current_user)
            return render json: { error: "You can only pick up your own Standee" }, status: :forbidden
          end

          standee.destroy
          broadcast(standee.map_id, type: "standee:pickup", id: standee.id)
          head :no_content
        end

        # GET /api/v1/standees/mine — the caller's Standees across every map,
        # with the world-wide cap and the count already out (#371). Feeds the
        # deploy affordance's "N of 3 out" before the employee writes anything,
        # so they are never asked to fill in a form they cannot submit. Not
        # scoped to a map, so it skips `load_map`.
        def mine
          budget = ::Standees::Budget.for(current_user)
          render json: {
            cap: ::Standees::Budget::CAP,
            out: budget.out,
            standees: budget.standees.map { |s| ::Standees::StandeeSerializer.mine(s) }
          }
        end

        private

        # Tell the map a cutout went up or came down (#375), so it appears and
        # vanishes for everyone standing there without a reload. Reached only
        # after a successful write — a refused deploy or a non-owner's pick-up
        # broadcasts nothing. The Standee is serialized without a viewer — one
        # fanout cannot carry a per-recipient `mine` — which is sound because
        # `userId` makes every client drop its own echo, and every recipient
        # left is by definition not the owner.
        def broadcast(map_id, frame)
          ActionCable.server.broadcast(
            PresenceChannel.standee_stream(map_id),
            frame.merge(userId: current_user.external_id)
          )
        end

        def load_map
          @map = ::Maps::Map.find_by!(slug: params[:slug])
          return if @map.accessible_to?(current_user, roles: current_roles, groups: current_groups)

          render json: { error: "Forbidden" }, status: :forbidden
        end

        def deploy_params
          params.permit(:x, :y, :message, :detail, :reply_link, :expires_days)
        end
      end
    end
  end
end
