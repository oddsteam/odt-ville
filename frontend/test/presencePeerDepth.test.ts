import { describe, expect, it, vi } from 'vitest'

// A peer avatar is character-shaped exactly like the local one, so on an
// authored map it must depth-sort against placed objects the same way (#402):
// MapScene used to set a peer's depth once, at spawn, to the flat player band
// and never recompute it, so a peer on a statue plinth drew over art that
// covers the local avatar there. These drive presenceFrame against a hand-built
// scene — the same stub pattern the peer-feet test uses — and read the depth the
// peer's container ends up at on spawn, mid-step, and on arrival.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Loader: { Events: { COMPLETE: 'complete' } },
    Events: { EventEmitter: class {} },
  },
}))

const { default: MapScene } = await import('../src/game/phaser/scenes/MapScene.js')
const { MAP_PLAYER_DEPTH, MAP_PLAYER_OVERHANG_DEPTH, MAP_PLAYER_FOREGROUND_DEPTH, MAP_NAMEPLATE_DEPTH } = await import(
  '../src/game/phaser/mapWalk.ts'
)

function fakeSprite() {
  const s: any = {}
  for (const m of ['setTexture', 'setFlipX', 'setDisplaySize', 'setScale', 'setOrigin', 'setFrame']) {
    s[m] = () => s
  }
  s.anims = { play() {}, stop() {} }
  return s
}

// `overhang`/`fg` are sets of "x,y" keys the map treats as walk-under / masked
// cells. The tween is captured, not run, so a test can settle it by hand.
function fakeScene(overhang: string[] = [], fg: string[] = []) {
  const tween: { onComplete?: () => void } = {}
  return Object.assign(Object.create(MapScene.prototype), {
    peerChars: new Map(),
    remoteRoster: new Map(),
    remoteSprites: new Map(),
    remotePlates: new Map(),
    cardBadges: new Map(),
    avatarsAsked: new Set(),
    // The local avatar shares the peers' rows here (row 4), so peer-vs-local row
    // sorting (#403) leaves the plain-cell depth at the flat band — these cases
    // isolate the overhang / foreground rule (#402). The peer↔row sort has its
    // own scene test (presencePeerSort).
    playerTile: { x: 0, y: 4 },
    presence: { ownId: 'me', send() {} },
    isOverhang: (x: number, y: number) => overhang.includes(`${x},${y}`),
    isForeground: (x: number, y: number) => fg.includes(`${x},${y}`),
    loadPeerCharacter() {},
    sendPosition() {},
    tween,
    textures: { exists: () => false },
    load: { image() {}, once() {}, start() {} },
    add: {
      sprite: () => fakeSprite(),
      text: () => fakeSprite(),
      container(x: number, y: number, list: unknown[]) {
        return {
          x,
          y,
          list,
          depth: 0,
          setDepth(d: number) {
            this.depth = d
            return this
          },
          setVisible() {
            return this
          },
          setPosition(nx: number, ny: number) {
            this.x = nx
            this.y = ny
            return this
          },
          add() {},
        }
      },
    },
    tweens: {
      killTweensOf() {},
      add(cfg: { onComplete?: () => void }) {
        tween.onComplete = cfg.onComplete
      },
    },
  })
}

const move = (x: number, y: number) => ({
  type: 'move' as const,
  userId: 'peer',
  name: 'Peer',
  x,
  y,
  facing: 'down' as const,
  manifestId: null,
})

const depthOf = (scene: any) => scene.remoteSprites.get('peer').depth
const plateDepthOf = (scene: any) => scene.remotePlates.get('peer').depth

describe('a peer spawning', () => {
  it('sits in the flat player band on a plain cell — a legacy map is unchanged', () => {
    const scene = fakeScene()
    scene.presenceFrame(move(3, 4))
    expect(depthOf(scene)).toBe(MAP_PLAYER_DEPTH)
  })

  it('drops behind the object art on an overhang cell (walk-under)', () => {
    const scene = fakeScene(['3,4'])
    scene.presenceFrame(move(3, 4))
    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })

  it('slots under the masked canopy on a foreground cell', () => {
    const scene = fakeScene([], ['3,4'])
    scene.presenceFrame(move(3, 4))
    expect(depthOf(scene)).toBe(MAP_PLAYER_FOREGROUND_DEPTH)
  })

  it('lets overhang win when a cell is both overhang and foreground', () => {
    const scene = fakeScene(['3,4'], ['3,4'])
    scene.presenceFrame(move(3, 4))
    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })
})

describe('a peer moving', () => {
  it('holds the walk-under band mid-step, then settles flat, stepping out of an overhang cell', () => {
    const scene = fakeScene(['3,4'])
    scene.presenceFrame(move(3, 4)) // spawn on the overhang cell
    scene.presenceFrame(move(3, 3)) // step north, off it

    // Mid-slide it overlaps both cells, so it keeps the walk-under band — a peer
    // must not pop over the art it is still standing in front of.
    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
    scene.tween.onComplete()
    // Landed north of the object and north of the local avatar (row 4), so it
    // settles just behind the player band — the #403 row rule, no longer flat.
    expect(depthOf(scene)).toBe(MAP_PLAYER_DEPTH - 1)
  })

  it('takes the walk-under band from the first frame stepping into an overhang cell', () => {
    const scene = fakeScene(['3,4'])
    scene.presenceFrame(move(3, 3)) // spawn on a plain cell
    scene.presenceFrame(move(3, 4)) // step south, onto the overhang cell

    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
    scene.tween.onComplete()
    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })

  it('re-derives depth on a plain move — a legacy map stays flat throughout', () => {
    const scene = fakeScene()
    scene.presenceFrame(move(3, 3))
    scene.presenceFrame(move(3, 4))

    expect(depthOf(scene)).toBe(MAP_PLAYER_DEPTH)
    scene.tween.onComplete()
    expect(depthOf(scene)).toBe(MAP_PLAYER_DEPTH)
  })
})

describe('a peer nameplate (#483)', () => {
  it('holds the fixed nameplate depth while the body drops onto an overhang cell', () => {
    const scene = fakeScene(['3,4'])
    scene.presenceFrame(move(3, 4))

    // The body sinks below the prop band (walk-under), but the plate sits in its
    // own container above every prop band, so it is never swallowed by the art.
    expect(depthOf(scene)).toBe(MAP_PLAYER_OVERHANG_DEPTH)
    expect(plateDepthOf(scene)).toBe(MAP_NAMEPLATE_DEPTH)
  })

  it('keeps the nameplate depth on a foreground cell too', () => {
    const scene = fakeScene([], ['3,4'])
    scene.presenceFrame(move(3, 4))

    expect(depthOf(scene)).toBe(MAP_PLAYER_FOREGROUND_DEPTH)
    expect(plateDepthOf(scene)).toBe(MAP_NAMEPLATE_DEPTH)
  })

  it('holds the nameplate depth across a walking step, whatever the body does', () => {
    const scene = fakeScene(['3,4'])
    scene.presenceFrame(move(3, 3)) // spawn on a plain cell
    scene.presenceFrame(move(3, 4)) // step onto the overhang cell

    expect(plateDepthOf(scene)).toBe(MAP_NAMEPLATE_DEPTH)
    scene.tween.onComplete()
    expect(plateDepthOf(scene)).toBe(MAP_NAMEPLATE_DEPTH)
  })
})
