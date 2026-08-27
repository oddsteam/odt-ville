import { describe, expect, it, vi } from 'vitest'

// A peer avatar is character-shaped exactly like a placed NPC, so on an authored
// map it sorts against the local avatar's row the same way (#403): a peer south
// of the local avatar covers it, one north draws behind, and two peers on
// different rows order against each other. The local row is the sort key, so a
// re-sort must happen both when a peer moves (its own frame) and when the local
// avatar moves (`sortPeers`). These drive presenceFrame / sortPeers against the
// same hand-built scene the peer-depth test uses and read each peer container's
// resulting depth.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Loader: { Events: { COMPLETE: 'complete' } },
    Events: { EventEmitter: class {} },
  },
}))

const { default: MapScene } = await import('../src/game/phaser/scenes/MapScene.js')
const { MAP_PLAYER_DEPTH, MAP_PLAYER_OVERHANG_DEPTH } = await import('../src/game/phaser/mapWalk.ts')

function fakeSprite() {
  const s: any = {}
  for (const m of ['setTexture', 'setFlipX', 'setDisplaySize', 'setScale', 'setOrigin', 'setFrame']) {
    s[m] = () => s
  }
  s.anims = { play() {}, stop() {} }
  return s
}

// The local avatar stands on `playerRow`; `overhang` are walk-under cells.
function fakeScene(playerRow: number, overhang: string[] = []) {
  return Object.assign(Object.create(MapScene.prototype), {
    peerChars: new Map(),
    remoteRoster: new Map(),
    remoteSprites: new Map(),
    peerQueues: new Map(),
    peerTiles: new Map(),
    remotePlates: new Map(),
    cardBadges: new Map(),
    avatarsAsked: new Set(),
    playerTile: { x: 0, y: playerRow },
    presence: { ownId: 'me', send() {} },
    isOverhang: (x: number, y: number) => overhang.includes(`${x},${y}`),
    isForeground: () => false,
    loadPeerCharacter() {},
    sendPosition() {},
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
      add() {},
    },
  })
}

const spawn = (userId: string, x: number, y: number) => ({
  type: 'move' as const,
  userId,
  name: userId,
  x,
  y,
  facing: 'down' as const,
  manifestId: null,
})

const depthOf = (scene: any, userId: string) => scene.remoteSprites.get(userId).depth

describe('a peer sorting against the local avatar', () => {
  it('draws a peer south of the local avatar over it', () => {
    const scene = fakeScene(3)
    scene.presenceFrame(spawn('south', 2, 5))
    expect(depthOf(scene, 'south')).toBeGreaterThan(MAP_PLAYER_DEPTH)
  })

  it('draws a peer north of the local avatar behind it', () => {
    const scene = fakeScene(3)
    scene.presenceFrame(spawn('north', 2, 1))
    expect(depthOf(scene, 'north')).toBeLessThan(MAP_PLAYER_DEPTH)
  })

  it('orders two peers on the same side by their own rows', () => {
    const scene = fakeScene(0)
    scene.presenceFrame(spawn('near', 2, 2))
    scene.presenceFrame(spawn('far', 2, 5))
    expect(depthOf(scene, 'far')).toBeGreaterThan(depthOf(scene, 'near'))
  })

  it('keeps a peer under an object’s art whatever its row (#402 wins)', () => {
    const scene = fakeScene(0, ['2,5'])
    scene.presenceFrame(spawn('under', 2, 5)) // far south, but on an overhang cell
    expect(depthOf(scene, 'under')).toBe(MAP_PLAYER_OVERHANG_DEPTH)
  })
})

describe('re-sorting when the local avatar moves', () => {
  it('flips who covers whom as the local row is the sort key', () => {
    const scene = fakeScene(3)
    scene.presenceFrame(spawn('peer', 2, 4)) // one row south → covers
    expect(depthOf(scene, 'peer')).toBeGreaterThan(MAP_PLAYER_DEPTH)

    // The local avatar walks two rows south, past the peer, which now sits north.
    scene.sortPeers(5)
    expect(depthOf(scene, 'peer')).toBeLessThan(MAP_PLAYER_DEPTH)
  })
})
