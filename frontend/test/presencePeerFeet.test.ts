import { describe, expect, it, vi } from 'vitest'

// A peer's foot lift must follow *their* character, not the local player's
// (#274): the bundled rpg-char-01 needs PLAYER_FEET_LIFT for its padded box, a
// manifest sprite stands on the tile line. MapScene extends Phaser.Scene and
// only its presence methods are under test, so stub the engine and call them
// against a hand-built scene.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Loader: { Events: { COMPLETE: 'complete' } },
    Events: { EventEmitter: class {} },
  },
}))

const { default: MapScene } = await import('../src/game/phaser/scenes/MapScene.js')
const { TILE, PLAYER_FEET_LIFT } = await import('../src/game/constants.js')

const RIG = {
  scale: 1.5,
  charDir: {
    down: { idleFrame: 'idleDown.0', idleAnimKey: null, idleFlip: false },
  },
}

function fakeSprite() {
  return {
    setTexture() {
      return this
    },
    setFlipX() {
      return this
    },
    setDisplaySize() {
      return this
    },
    setScale() {
      return this
    },
    setOrigin() {
      return this
    },
    setFrame() {
      return this
    },
    anims: { play() {}, stop() {} },
  }
}

function fakeScene(peerChars: Map<number | null, unknown>) {
  const tweened: Array<{ x: number; y: number }> = []
  return Object.assign(Object.create(MapScene.prototype), {
    peerChars,
    remoteRoster: new Map(),
    remoteSprites: new Map(),
    presence: { ownId: 'me', send() {} },
    tweened,
    loadPeerCharacter() {},
    sendPosition() {},
    add: {
      sprite: () => fakeSprite(),
      text: () => fakeSprite(),
      container(x: number, y: number, list: unknown[]) {
        return {
          x,
          y,
          list,
          setDepth() {
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
        }
      },
    },
    tweens: {
      killTweensOf() {},
      add(cfg: { x: number; y: number }) {
        tweened.push({ x: cfg.x, y: cfg.y })
      },
    },
  })
}

const move = (manifestId: number | null) => ({
  type: 'move' as const,
  userId: 'peer',
  name: 'Peer',
  x: 3,
  y: 4,
  facing: 'down' as const,
  manifestId,
})

const TILE_LINE = (4 + 1) * TILE

describe('remote avatar feet', () => {
  it('stands a manifest peer on the tile line, with no bundled lift', () => {
    const scene = fakeScene(new Map([[1, RIG]]))
    scene.presenceFrame(move(1))

    expect(scene.remoteSprites.get('peer').y).toBe(TILE_LINE)
  })

  it('keeps the lift for a peer on the bundled fallback', () => {
    const scene = fakeScene(new Map())
    scene.presenceFrame(move(null))

    expect(scene.remoteSprites.get('peer').y).toBe(TILE_LINE + PLAYER_FEET_LIFT)
  })

  it('steps a manifest peer to the tile line', () => {
    const scene = fakeScene(new Map([[1, RIG]]))
    scene.presenceFrame(move(1))
    scene.presenceFrame(move(1))

    expect(scene.tweened.at(-1)).toEqual({ x: 3 * TILE + TILE / 2, y: TILE_LINE })
  })

  it('repositions a peer first seen while their character was in flight', () => {
    const scene = fakeScene(new Map([[1, null]]))
    scene.presenceFrame(move(1))
    scene.peerChars.set(1, RIG)
    scene.refreshPeers()

    expect(scene.remoteSprites.get('peer').y).toBe(TILE_LINE)
  })
})
