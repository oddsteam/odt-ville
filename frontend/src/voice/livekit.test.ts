// The LiveKit SFU voice path (#309, ADR-0011), unit-tested against a fake Room
// (jsdom has no livekit-client / no real SFU). Covers: joining a
// room + publishing the mic, remote audio attach at constant volume, mute
// mapping to setMicrophoneEnabled, and stop disconnecting.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLivekitVoice, type RoomLike } from './livekit.ts'
import type { Zone } from '../kernel/schema.ts'
import { DWELL_MS, LEAVE_RADIUS, PREJOIN_RADIUS, type MicStatus, type VoicePosition } from './schema.ts'

// A meeting zone anchored at (x,y) over a w×h footprint — the resolver reads
// these off the map's authored zones (#486).
const meetingZone = (x: number, y: number, roomId: string, w?: number, h?: number): Zone => ({
  trigger: 'on_enter',
  x,
  y,
  w,
  h,
  payload: { kind: 'meeting', roomId },
})
import type { CameraStatus, RemoteTile, ScreenShare } from './meetingState.ts'

class FakeTrack {
  constructor(
    public kind = 'audio',
    public source = kind === 'video' ? 'camera' : 'microphone',
  ) {}
  // A video track doubles as a self-view SelfView (attach/detach) in #487 tests.
  attach() {}
  detach() {}
}

class FakeRoom implements RoomLike {
  handlers = new Map<string, (...a: unknown[]) => void>()
  connected = false
  micEnabled: boolean | null = null
  cameraEnabled: boolean | null = null
  cameraDenied = false // set by a test to simulate a declined camera permission
  videoTrack = new FakeTrack('video')
  screenEnabled: boolean | null = null
  screenDenied = false // the user dismissed the browser's picker
  screenTrack = new FakeTrack('video', 'screen_share')
  disconnected = false
  localParticipant = {
    setMicrophoneEnabled: async (enabled: boolean) => {
      this.micEnabled = enabled
    },
    setCameraEnabled: async (enabled: boolean) => {
      if (enabled && this.cameraDenied) throw new Error('NotAllowedError')
      this.cameraEnabled = enabled
      return enabled ? { videoTrack: this.videoTrack } : undefined
    },
    setScreenShareEnabled: async (enabled: boolean) => {
      if (enabled && this.screenDenied) throw new Error('NotAllowedError')
      this.screenEnabled = enabled
      return enabled ? { videoTrack: this.screenTrack } : undefined
    },
  }
  on(event: string, cb: (...a: unknown[]) => void) {
    this.handlers.set(event, cb)
    return this
  }
  async connect() {
    this.connected = true
  }
  disconnect() {
    this.disconnected = true
  }
  emit(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args)
  }
}

const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

function harness(zones: Zone[] = []) {
  const room = new FakeRoom()
  const attached: FakeTrack[] = []
  const detached: FakeTrack[] = []
  const statuses: MicStatus[] = []
  const latencies: number[] = []
  const tokensFor: string[] = [] // the room keys getToken was asked for, in order
  const meetings: boolean[] = [] // onMeeting edges: in a meeting room or not
  const cameras: CameraStatus[] = [] // onCamera reports
  const selfViews: unknown[] = [] // attachSelfView payloads
  const rosters: RemoteTile[][] = [] // onParticipants emissions, in order
  const shares: ScreenShare[] = [] // onScreenShare emissions, in order (#489)
  let selfViewOn = false // detachSelfView flips this back off
  const mesh = createLivekitVoice({
    room,
    url: 'wss://example.livekit.cloud',
    proximityRoom: 'map-town',
    zones,
    getToken: async (roomKey) => {
      tokensFor.push(roomKey)
      return 'jwt'
    },
    attach: (t) => attached.push(t as FakeTrack),
    detach: (t) => detached.push(t as FakeTrack),
    onStatus: (s) => statuses.push(s),
    onJoinLatency: (ms) => latencies.push(ms),
    onMeeting: (inMeeting) => meetings.push(inMeeting),
    onCamera: (s) => cameras.push(s),
    attachSelfView: (t) => {
      selfViews.push(t)
      selfViewOn = true
    },
    detachSelfView: () => {
      selfViewOn = false
    },
    onParticipants: (list) => rosters.push(list),
    onScreenShare: (s) => shares.push(s),
  })
  return {
    room,
    mesh,
    attached,
    detached,
    statuses,
    latencies,
    tokensFor,
    meetings,
    cameras,
    selfViews,
    rosters,
    tiles: () => rosters.at(-1) ?? [],
    share: () => shares.at(-1) ?? { focused: null, mine: false },
    selfViewShown: () => selfViewOn,
  }
}

const at = (x: number): VoicePosition => ({ x, y: 0 })
// A one-peer roster placed `d` tiles from the origin (where we stand).
const roster = (d: number) => new Map([['peer', at(d)]])

describe('createLivekitVoice (#309)', () => {
  it('joins the room and publishes the mic once a peer is near', async () => {
    const { room, mesh } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(room.connected).toBe(true)
    expect(room.micEnabled).toBe(true)
  })

  it('attaches subscribed remote audio, ignoring video', async () => {
    const { room, attached } = harness()
    await flush()
    const audio = new FakeTrack('audio')
    room.emit('trackSubscribed', audio)
    room.emit('trackSubscribed', new FakeTrack('video'))
    expect(attached).toEqual([audio])
  })

  it('detaches a track when it unsubscribes', async () => {
    const { room, detached } = harness()
    const t = new FakeTrack('audio')
    room.emit('trackSubscribed', t)
    room.emit('trackUnsubscribed', t)
    expect(detached).toEqual([t])
  })

  it('maps mute to the microphone, reporting the standing choice', async () => {
    const { room, mesh, statuses } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(statuses.at(-1)).toEqual({ live: true, muted: false, denied: false })

    mesh.setMute(true)
    await flush()
    expect(room.micEnabled).toBe(false)
    expect(statuses.at(-1)).toEqual({ live: false, muted: true, denied: false })
  })

  it('stop disconnects the room', async () => {
    const { room, mesh } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    mesh.stop()
    expect(room.disconnected).toBe(true)
  })
})

describe('proximity-gated membership (#310)', () => {
  it('does not join on map entry — only when a peer is within the pre-join band', async () => {
    const { room, mesh } = harness()
    await flush()
    expect(room.connected).toBe(false) // constructed, not connected

    mesh.update(at(0), roster(PREJOIN_RADIUS)) // exactly at the band edge: still outside (<)
    await flush()
    expect(room.connected).toBe(false)

    mesh.update(at(0), roster(PREJOIN_RADIUS - 0.5)) // now inside the pre-join band
    await flush()
    expect(room.connected).toBe(true)
  })

  it('measures the room join latency (a reusable spike output)', async () => {
    const { mesh, latencies } = harness()
    mesh.update(at(0), roster(1))
    await flush()
    expect(latencies).toHaveLength(1)
    expect(latencies[0]).toBeGreaterThanOrEqual(0)
  })

  it('connects only within one tile: two tiles away stays out, a diagonal neighbour joins', async () => {
    const { room, mesh } = harness()
    mesh.update(at(0), roster(2)) // two tiles away: out of earshot
    await flush()
    expect(room.connected).toBe(false)

    mesh.update(at(0), new Map([['peer', { x: 1, y: 1 }]])) // diagonal neighbour
    await flush()
    expect(room.connected).toBe(true)
  })

  it('joins only once while a peer stays in range', async () => {
    const { room, mesh } = harness()
    let connects = 0
    const realConnect = room.connect.bind(room)
    room.connect = async (...a: unknown[]) => {
      connects++
      return realConnect(...(a as []))
    }
    mesh.update(at(0), roster(1))
    await flush()
    mesh.update(at(0), roster(1)) // still there — must not re-join
    await flush()
    expect(connects).toBe(1)
  })
})

describe('leave dwell timer (#310)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const joined = async (h: ReturnType<typeof harness>) => {
    h.mesh.update(at(0), roster(1))
    await flush()
    expect(h.room.connected).toBe(true)
  }

  it('stays connected in the dead-band beyond pre-join (no thrash)', async () => {
    const h = harness()
    await joined(h)
    // Between PRE-JOIN and LEAVE: not re-joining, but not leaving either.
    h.mesh.update(at(0), roster((PREJOIN_RADIUS + LEAVE_RADIUS) / 2))
    await flush()
    vi.advanceTimersByTime(DWELL_MS * 2)
    await flush()
    expect(h.room.disconnected).toBe(false)
  })

  it('leaves after the dwell timer once the pod empties', async () => {
    const h = harness()
    await joined(h)
    h.mesh.update(at(0), new Map()) // pod empties
    await flush()

    vi.advanceTimersByTime(DWELL_MS - 1)
    await flush()
    expect(h.room.disconnected).toBe(false) // still holding through the dwell

    vi.advanceTimersByTime(1)
    await flush()
    expect(h.room.disconnected).toBe(true) // dwell elapsed — now gone
  })

  it('a peer returning within the dwell cancels the leave', async () => {
    const h = harness()
    await joined(h)
    h.mesh.update(at(0), new Map()) // pod empties, dwell starts
    await flush()
    vi.advanceTimersByTime(DWELL_MS - 1)

    h.mesh.update(at(0), roster(1)) // back in range before the dwell fires
    await flush()
    vi.advanceTimersByTime(DWELL_MS)
    await flush()
    expect(h.room.disconnected).toBe(false) // never left, so no reconnect / no fresh minute
  })
})

describe('meeting rooms (#486)', () => {
  // A 3×3 room anchored at (5,5); (6,6) is inside, (0,0) is outside.
  const RECTS: Zone[] = [meetingZone(5, 5, 'standup', 3, 3)]

  it('joins the meeting room on entry, alone, regardless of proximity', async () => {
    const h = harness(RECTS)
    h.mesh.update({ x: 6, y: 6 }, new Map()) // inside the rect, nobody near
    await flush()
    expect(h.room.connected).toBe(true)
    expect(h.tokensFor).toEqual(['meeting-standup']) // not the proximity room
  })

  it('drops the proximity room when walking into a meeting room', async () => {
    const h = harness(RECTS)
    h.mesh.update({ x: 0, y: 0 }, roster(1)) // outside, a peer near → proximity join
    await flush()
    expect(h.tokensFor).toEqual(['map-town'])

    h.mesh.update({ x: 6, y: 6 }, roster(1)) // step into the rect
    await flush()
    expect(h.room.disconnected).toBe(true) // left the proximity room...
    expect(h.tokensFor).toEqual(['map-town', 'meeting-standup']) // ...for the meeting room
  })

  it('stays connected while standing still inside the room (joins once)', async () => {
    const h = harness(RECTS)
    let connects = 0
    const realConnect = h.room.connect.bind(h.room)
    h.room.connect = async (...a: unknown[]) => {
      connects++
      return realConnect(...(a as []))
    }
    h.mesh.update({ x: 6, y: 6 }, new Map())
    await flush()
    h.mesh.update({ x: 6, y: 6 }, new Map()) // still inside — must not re-join
    await flush()
    expect(connects).toBe(1)
  })

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    const entered = async (h: ReturnType<typeof harness>) => {
      h.mesh.update({ x: 6, y: 6 }, new Map())
      await flush()
      expect(h.room.connected).toBe(true)
    }

    it('leaves the meeting room only after the dwell once you walk out', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, new Map()) // walked out, nobody near

      vi.advanceTimersByTime(DWELL_MS - 1)
      await flush()
      expect(h.room.disconnected).toBe(false) // still connected through the dwell

      vi.advanceTimersByTime(1)
      await flush()
      expect(h.room.disconnected).toBe(true)
    })

    it('re-entering within the dwell cancels the leave, with no reconnect', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, new Map()) // walked out, dwell starts
      await flush()
      vi.advanceTimersByTime(DWELL_MS - 1)

      h.mesh.update({ x: 6, y: 6 }, new Map()) // back inside before the dwell fires
      await flush()
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.room.disconnected).toBe(false) // never left → no fresh billed minute
      expect(h.tokensFor).toEqual(['meeting-standup']) // one join only
    })

    it('falls back to the proximity room after the dwell when a peer is near', async () => {
      const h = harness(RECTS)
      await entered(h)
      h.mesh.update({ x: 0, y: 0 }, roster(1)) // walked out; a peer is in earshot
      await flush()
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.tokensFor).toEqual(['meeting-standup', 'map-town']) // meeting → proximity
    })
  })
})

describe('meeting HUD signals (#487)', () => {
  const RECTS: Zone[] = [meetingZone(5, 5, 'standup', 3, 3)]
  const inside = { x: 6, y: 6 }
  const outside = { x: 0, y: 0 }

  it('signals in-meeting on entry and out again once the dwell leaves', async () => {
    vi.useFakeTimers()
    try {
      const h = harness(RECTS)
      h.mesh.update(inside, new Map())
      await flush()
      expect(h.meetings).toEqual([true]) // HUD shows

      h.mesh.update(outside, new Map()) // walk out
      await flush()
      expect(h.meetings).toEqual([true]) // still connected through the dwell
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.meetings).toEqual([true, false]) // HUD tears down
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not signal in-meeting for the proximity room', async () => {
    const h = harness(RECTS)
    h.mesh.update(outside, roster(1)) // outside, a peer near → proximity join
    await flush()
    expect(h.meetings).toEqual([])
  })

  it('camera is off on entry — nothing is published without a toggle', async () => {
    const h = harness(RECTS)
    h.mesh.update(inside, new Map())
    await flush()
    expect(h.room.cameraEnabled).toBe(null) // never enabled
    expect(h.selfViewShown()).toBe(false)
  })

  it('toggling the camera on publishes and renders a self-view; off stops it', async () => {
    const h = harness(RECTS)
    h.mesh.update(inside, new Map())
    await flush()

    h.mesh.setCamera!(true)
    await flush()
    expect(h.room.cameraEnabled).toBe(true)
    expect(h.selfViews).toEqual([h.room.videoTrack])
    expect(h.selfViewShown()).toBe(true)
    expect(h.cameras.at(-1)).toBe('on')

    h.mesh.setCamera!(false)
    await flush()
    expect(h.room.cameraEnabled).toBe(false) // the device light goes out
    expect(h.selfViewShown()).toBe(false)
    expect(h.cameras.at(-1)).toBe('off')
  })

  it('a denied camera is a clean off state, not an error', async () => {
    const h = harness(RECTS)
    h.room.cameraDenied = true
    h.mesh.update(inside, new Map())
    await flush()

    h.mesh.setCamera!(true)
    await flush()
    expect(h.cameras.at(-1)).toBe('denied')
    expect(h.selfViewShown()).toBe(false)
  })

  it('walking out stops the camera track even with the tab still open', async () => {
    vi.useFakeTimers()
    try {
      const h = harness(RECTS)
      h.mesh.update(inside, new Map())
      await flush()
      h.mesh.setCamera!(true)
      await flush()
      expect(h.room.cameraEnabled).toBe(true)

      h.mesh.update(outside, new Map()) // walk out
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.room.cameraEnabled).toBe(false) // stopped on leave, not just on tab close
      expect(h.selfViewShown()).toBe(false)
      expect(h.cameras.at(-1)).toBe('off')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop() stops the camera and signals out of the meeting', async () => {
    const h = harness(RECTS)
    h.mesh.update(inside, new Map())
    await flush()
    h.mesh.setCamera!(true)
    await flush()

    h.mesh.stop()
    expect(h.room.cameraEnabled).toBe(false)
    expect(h.meetings.at(-1)).toBe(false)
  })

  it('ignores a camera toggle when not in a meeting room', async () => {
    const h = harness(RECTS)
    h.mesh.update(outside, roster(1)) // proximity room, no meeting
    await flush()
    h.mesh.setCamera!(true)
    await flush()
    expect(h.room.cameraEnabled).toBe(null)
  })
})

describe('remote meeting tiles (#488)', () => {
  const RECTS: Zone[] = [meetingZone(5, 5, 'standup', 3, 3)]
  const inside = { x: 6, y: 6 }
  const outside = { x: 0, y: 0 }
  const peer = (identity: string, name?: string) => ({ identity, name })

  const enter = async (rects = RECTS) => {
    const h = harness(rects)
    h.mesh.update(inside, new Map())
    await flush()
    return h
  }

  it('adds a video tile when a remote camera track subscribes', async () => {
    const h = await enter()
    const video = new FakeTrack('video')
    h.room.emit('trackSubscribed', video, {}, peer('alice', 'Alice'))
    expect(h.tiles()).toEqual([{ id: 'alice', name: 'Alice', video, speaking: false }])
  })

  it('drops a tile to a placeholder when the camera track unsubscribes, keeping the tile', async () => {
    const h = await enter()
    const video = new FakeTrack('video')
    h.room.emit('trackSubscribed', video, {}, peer('alice', 'Alice'))
    h.room.emit('trackUnsubscribed', video, {}, peer('alice', 'Alice'))
    expect(h.tiles()).toEqual([{ id: 'alice', name: 'Alice', video: null, speaking: false }])
  })

  it('shows a placeholder tile for a camera-off participant who just connected', async () => {
    const h = await enter()
    h.room.emit('participantConnected', peer('bob', 'Bob'))
    expect(h.tiles()).toEqual([{ id: 'bob', name: 'Bob', video: null, speaking: false }])
  })

  it('removes the tile when the participant leaves', async () => {
    const h = await enter()
    h.room.emit('participantConnected', peer('bob', 'Bob'))
    h.room.emit('participantDisconnected', peer('bob', 'Bob'))
    expect(h.tiles()).toEqual([])
  })

  it('marks the active speaker on their tile', async () => {
    const h = await enter()
    h.room.emit('participantConnected', peer('alice', 'Alice'))
    h.room.emit('participantConnected', peer('bob', 'Bob'))
    h.room.emit('activeSpeakersChanged', [peer('bob')])
    expect(h.tiles().find((t) => t.id === 'bob')?.speaking).toBe(true)
    expect(h.tiles().find((t) => t.id === 'alice')?.speaking).toBe(false)
  })

  it('names the tile by identity when the participant has no display name', async () => {
    const h = await enter()
    h.room.emit('participantConnected', peer('u-42'))
    expect(h.tiles()).toEqual([{ id: 'u-42', name: 'u-42', video: null, speaking: false }])
  })

  it('clears the tiles when leaving the meeting room', async () => {
    vi.useFakeTimers()
    try {
      const h = harness(RECTS)
      h.mesh.update(inside, new Map())
      await flush()
      h.room.emit('participantConnected', peer('alice', 'Alice'))
      expect(h.tiles()).toHaveLength(1)

      h.mesh.update(outside, new Map())
      vi.advanceTimersByTime(DWELL_MS)
      await flush()
      expect(h.tiles()).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not surface tiles for the proximity room', async () => {
    const h = harness(RECTS)
    h.mesh.update(outside, roster(1)) // proximity join, not a meeting
    await flush()
    h.room.emit('participantConnected', peer('alice', 'Alice'))
    expect(h.rosters).toEqual([])
  })
})

describe('screen share (#489)', () => {
  const RECTS: Zone[] = [meetingZone(5, 5, 'standup', 3, 3)]
  const inside = { x: 6, y: 6 }
  const peer = (identity: string, name?: string) => ({ identity, name })
  const screen = () => new FakeTrack('video', 'screen_share')

  const enter = async () => {
    const h = harness(RECTS)
    h.mesh.update(inside, new Map())
    await flush()
    return h
  }

  it('focuses a remote screen track instead of making it a camera tile', async () => {
    const h = await enter()
    const track = screen()
    h.room.emit('trackSubscribed', track, {}, peer('alice', 'Alice'))
    expect(h.share()).toEqual({ focused: { id: 'alice', name: 'Alice', video: track }, mine: false })
    expect(h.tiles()).toEqual([{ id: 'alice', name: 'Alice', video: null, speaking: false }])
  })

  it('clears the focus when the share track unsubscribes', async () => {
    const h = await enter()
    const track = screen()
    h.room.emit('trackSubscribed', track, {}, peer('alice', 'Alice'))
    h.room.emit('trackUnsubscribed', track, {}, peer('alice', 'Alice'))
    expect(h.share().focused).toBe(null)
  })

  it('focuses the newest of two concurrent shares, falling back when it stops', async () => {
    const h = await enter()
    const a = screen()
    const b = screen()
    h.room.emit('trackSubscribed', a, {}, peer('alice', 'Alice'))
    h.room.emit('trackSubscribed', b, {}, peer('bob', 'Bob'))
    expect(h.share().focused?.id).toBe('bob')
    h.room.emit('trackUnsubscribed', b, {}, peer('bob', 'Bob'))
    expect(h.share().focused?.id).toBe('alice')
  })

  it('drops the focus when the sharer leaves, and when we leave the room', async () => {
    const h = await enter()
    h.room.emit('trackSubscribed', screen(), {}, peer('alice', 'Alice'))
    h.room.emit('participantDisconnected', peer('alice', 'Alice'))
    expect(h.share().focused).toBe(null)
    h.room.emit('trackSubscribed', screen(), {}, peer('bob', 'Bob'))
    h.mesh.stop()
    expect(h.share().focused).toBe(null)
  })

  it('publishes my screen on start and focuses it as mine', async () => {
    const h = await enter()
    await h.mesh.setScreenShare?.(true)
    expect(h.room.screenEnabled).toBe(true)
    expect(h.share()).toEqual({ focused: { id: 'me', name: 'You', video: h.room.screenTrack }, mine: true })
  })

  it('stops the publish and returns to the grid on stop', async () => {
    const h = await enter()
    await h.mesh.setScreenShare?.(true)
    await h.mesh.setScreenShare?.(false)
    expect(h.room.screenEnabled).toBe(false)
    expect(h.share()).toEqual({ focused: null, mine: false })
  })

  it("stays off when the browser's picker is dismissed", async () => {
    const h = await enter()
    h.room.screenDenied = true
    await h.mesh.setScreenShare?.(true)
    expect(h.share()).toEqual({ focused: null, mine: false })
  })

  it("handles the browser's own Stop sharing control (local track unpublished)", async () => {
    const h = await enter()
    await h.mesh.setScreenShare?.(true)
    h.room.emit('localTrackUnpublished', { source: 'screen_share' })
    expect(h.share()).toEqual({ focused: null, mine: false })
  })

  it('a remote share started after mine takes the focus, but I am still sharing', async () => {
    const h = await enter()
    await h.mesh.setScreenShare?.(true)
    h.room.emit('trackSubscribed', screen(), {}, peer('alice', 'Alice'))
    expect(h.share().focused?.id).toBe('alice')
    expect(h.share().mine).toBe(true)
  })

  it('stops my share when I walk out of the meeting room', async () => {
    const h = await enter()
    await h.mesh.setScreenShare?.(true)
    h.mesh.stop()
    expect(h.room.screenEnabled).toBe(false)
    expect(h.share()).toEqual({ focused: null, mine: false })
  })
})
