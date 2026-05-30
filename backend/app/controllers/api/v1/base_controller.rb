module Api
  module V1
    # Shared base for all v1 API controllers.
    class BaseController < ApplicationController
      before_action :authenticate_user!
    end
  end
end
