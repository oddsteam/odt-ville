module Api
  module V1
    module Org
      # The org roster (#388, ADR-0016), read-only for the whole resource: the
      # app is a downstream consumer and never authors org data, so there is no
      # write half to gate.
      class EmployeesController < BaseController
        # Admin-only in full, unlike the catalog reads that are open to any
        # signed-in user — this is every colleague's name and email address.
        before_action -> { require_role!("admin") }

        # GET /api/v1/org/employees — the roster, name-ordered.
        def index
          # No serializer: the payload IS the row, minus the timestamps and the
          # tenant. `departed` is deliberately absent — `left_on` is the answer.
          # Sites ride along read-only — there is no write half to this resource
          # and #389 says there must not be one; assignment happens upstream.
          # `linked` (#390) is a boolean, not the user: the page shows the gap,
          # and shipping the login row here would leak identity into a roster read.
          render json: ::Org::Employee.includes(:sites, :user).order(:name).map { |employee|
            employee.as_json(
              only: %i[id email name nickname join_date left_on],
              include: { sites: { only: %i[name kind] } }
            ).merge("linked" => employee.user.present?,
                    # #391: whether the avatar sync can reach a face for this
                    # person. The id itself stays server-side — the page needs
                    # the gap, not Basecamp's primary key.
                    "basecamp_linked" => employee.basecamp_person_id.present?)
          }
        end
      end
    end
  end
end
