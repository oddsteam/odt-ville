module Api
  module V1
    module Org
      # The Sites read for admin pickers (#503): the client-engagement names a
      # community's scope can be set to. Read-only and admin-gated, like the
      # roster — the app never authors org data (ADR-0016).
      class SitesController < BaseController
        before_action -> { require_role!("admin") }

        # GET /api/v1/org/sites — site names, ordered. A bare name list on
        # purpose: the community scope is FK-less by name (soft-seam), so a name
        # is all the picker needs.
        def index
          render json: { sites: ::Org::Site.order(:name).pluck(:name) }
        end
      end
    end
  end
end
