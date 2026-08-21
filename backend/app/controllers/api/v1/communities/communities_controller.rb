module Api
  module V1
    module Communities
      # Communities CRUD (ADR-0010) — controller under Api::V1::Communities::,
      # URL unchanged (`scope module:` nests the controller, not the path). The
      # `::Communities::` refs are leading-colon on purpose: Api::V1::Communities
      # shadows the top-level Communities domain module.
      class CommunitiesController < BaseController
        # Authoring writes require the `admin` realm role (#100); reads stay open.
        before_action -> { require_role!("admin") }, only: %i[create update destroy]

        BOARD_TYPES = %w[must_know should_know nice_to_know].freeze

        # GET /api/v1/communities
        # The default is the per-user hometown read, scoped server-side to the
        # caller's effective sites — roster placements ∪ `client_site` (#497,
        # #499) — plus downtown for Staff; an external Client is gated from the
        # downtown (`site: nil`) buildings (#498). `?scope=all` is the admin CRUD
        # list, which stays unfiltered — only the hometown read is scoped.
        def index
          communities = current_user.company.houses.active.ordered
          unless params[:scope] == "all"
            communities = communities.for_sites(current_user.effective_site_names, downtown: !current_user.external)
          end
          communities = communities.includes(boards: { content_items: :user_content_states }).to_a
          render json: ::Communities::CommunitiesSerializer.call(
            communities: communities, user: current_user, now: Time.current
          )
        end

        # GET /api/v1/communities/:id
        def show
          community = current_user.company.houses.active
                                  .includes(boards: { content_items: :user_content_states })
                                  .find(params[:id])
          render json: ::Communities::CommunitySerializer.call(
            community: community, user: current_user, now: Time.current
          )
        end

        # POST /api/v1/communities — admin: add a community. Creates the
        # community, its three boards, and a welcome item so it is not empty.
        def create
          company = current_user.company
          attrs = community_params

          community = company.houses.create!(
            title: attrs[:title].presence || "New Community",
            color: attrs[:color].presence || "#888888",
            logo_url: attrs[:logo_url].to_s,
            category_key: attrs[:category_key].presence || "community",
            site: attrs[:site].presence,
            position_order: (company.houses.maximum(:position_order) || 0) + 1,
            active: true
          )

          BOARD_TYPES.each { |bt| community.boards.create!(board_type: bt) }
          community.boards.find_by(board_type: "must_know").content_items.create!(
            title: "Welcome to #{community.title}",
            summary: "This community space has just opened on the map.",
            body: "Its Must Know, Should Know and Nice to Know boards are ready for updates.",
            priority: "normal",
            requires_ack: false,
            active: true,
            effective_from: Time.current
          )

          render json: { id: community.id, title: community.title }, status: :created
        end

        # PATCH /api/v1/communities/:id — admin: rename, plus the door-Portal
        # editor (ADR-0005).
        # Each field acts only when its key is sent, so gate and node saves can't
        # clobber each other. `title`: renamed in place, blank is rejected (the
        # name is how the house is found on the map). `entry_gate` (#38): posture-login needs a
        # posture_set_id, blank clears both columns. `interior_node_slug` (#113):
        # must name an existing map, blank clears (door falls back to the
        # hardcoded InteriorScene). `tile_object_id` (#292): must name a saved
        # 'building' object, blank clears (plot falls back to the active
        # object, then bundled art).
        def update
          community = current_user.company.houses.find(params[:id])
          attrs = {}

          if params.key?(:title)
            title = params[:title].to_s.strip
            return render json: { error: "Title can't be blank" }, status: :unprocessable_entity if title.blank?
            attrs[:title] = title
          end

          if params.key?(:interior_node_slug)
            slug = params[:interior_node_slug].presence
            return render json: { error: "Unknown node: #{slug}" }, status: :unprocessable_entity if slug && !::Maps::Map.exists?(slug: slug)
            attrs[:interior_node_slug] = slug
          end

          if params.key?(:tile_object_id)
            oid = params[:tile_object_id].presence
            if oid && ::Catalog::TileObject.find_by(id: oid)&.kind != "building"
              return render json: { error: "Unknown building object: #{oid}" }, status: :unprocessable_entity
            end
            attrs[:tile_object_id] = oid
          end

          if params.key?(:entry_gate)
            gate = params[:entry_gate].presence
            if gate
              return render json: { error: "Unknown gate: #{gate}" }, status: :unprocessable_entity unless gate == ::Api::V1::Posture::PostureController::GATE
              return render json: { error: "posture_set_id is required for a gate" }, status: :unprocessable_entity if params[:posture_set_id].blank?
              attrs.merge!(entry_gate: gate, posture_set_id: params[:posture_set_id])
            else
              attrs.merge!(entry_gate: nil, posture_set_id: nil)
            end
          end

          # Site scope (#503): blank clears back to downtown (`nil`); a present
          # name must be a known Site — FK-less by name (soft-seam), so this is a
          # name check, not an association. Only the hometown read consults it.
          if params.key?(:site)
            site = params[:site].presence
            return render json: { error: "Unknown site: #{site}" }, status: :unprocessable_entity if site && !::Org::Site.exists?(name: site)
            attrs[:site] = site
          end

          community.update!(attrs) if attrs.any?
          head :no_content
        end

        # DELETE /api/v1/communities/:id — admin: remove a community (and its
        # boards, content and per-user state, via dependent: :destroy).
        def destroy
          community = current_user.company.houses.find(params[:id])
          community.destroy!
          head :no_content
        end

        private

        def community_params
          params.permit(:title, :color, :logo_url, :category_key, :site)
        end
      end
    end
  end
end
