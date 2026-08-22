module Voice
  # The LiveKit room-key convention, one home on the Rails side (#518). The
  # frontend's roomKey() (frontend/src/voice/schema.ts) composes the exact same
  # strings; a drift here 403s the token request and voice silently goes quiet,
  # so the coupling is pinned by the voice-token request test.
  class RoomKey
    MAP_PREFIX = "map-"
    MEETING_PREFIX = "meeting-"

    # The map's own proximity room — any authenticated user may open it (#308).
    def self.map(slug)
      "#{MAP_PREFIX}#{slug}"
    end

    # An authored meeting room on a map (#486); authorization is the caller's job.
    def self.meeting(room_id)
      "#{MEETING_PREFIX}#{room_id}"
    end
  end
end
