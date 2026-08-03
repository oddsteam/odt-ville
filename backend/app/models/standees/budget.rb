module Standees
  # The world-wide Standees budget (#371, ADR-0015): an employee may have at
  # most 3 Standees out at once, counted across *every* map — not 3 per map.
  # The scarcity is the feature: a single budget forces the judgement about
  # whether a message is worth interrupting someone's walk for.
  #
  # This is the write-path guard the controller consults before deploying, and
  # the arithmetic the client mirrors in `standees/budget.ts`. At the cap the
  # deploy is refused with a pointer to where the existing Standees are standing
  # — never a silent replace of the oldest, which would destroy something the
  # owner still believes is live.
  class Budget
    CAP = 3

    # The caller's Standees across all maps, newest last, with the map preloaded
    # so `refusal` can name it without an N+1.
    def self.for(user)
      new(::Standees::Standee.where(user_id: user.id).includes(:map).order(:id).to_a)
    end

    attr_reader :standees

    def initialize(standees)
      @standees = standees
    end

    # How many are out, and how many the employee may still deploy.
    def out
      standees.size
    end

    def remaining
      [CAP - out, 0].max
    end

    def allows?
      out < CAP
    end

    # The refusal shown when deploying at the cap — nil when a deploy is allowed.
    # Names where the existing Standees are (map title + cell) so the owner can
    # decide which to pick up, rather than a bare "you're at your limit".
    def refusal
      return nil if allows?

      places = standees.map { |s| "#{s.map.title} (#{s.cell_x}, #{s.cell_y})" }.join(", ")
      "You already have all #{CAP} Standees out — pick one up to deploy another. " \
        "They're standing on: #{places}."
    end
  end
end
