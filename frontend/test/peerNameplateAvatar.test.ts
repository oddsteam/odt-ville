import { describe, expect, it, vi } from 'vitest'

// A player's face hangs on their nameplate (#323). What matters at the scene
// level is who ends up wearing one: the peer who has an avatar, nobody when the
// proxy 404s, and — the leak — not a container whose peer already left. Same
// stubbed-engine harness as the peer-feet test.
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Loader: { Events: { COMPLETE: 'complete' } },
    Events: { EventEmitter: class {} },
  },
}))

const { default: MapScene } = await import('../src/game/phaser/scenes/MapScene.js')

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

function fakeScene() {
  const textures = new Set<string>()
  const drains: Array<() => void> = []
  return Object.assign(Object.create(MapScene.prototype), {
    peerChars: new Map(),
    remoteRoster: new Map(),
    remoteSprites: new Map(),
    avatarsAsked: new Set(),
    cardBadges: new Map(),
    // A plain map: peers depth-sort against nothing here — faces are the subject.
    isOverhang: () => false,
    isForeground: () => false,
    // The local avatar's row, the peer depth sort key (#403) — irrelevant here.
    playerTile: { x: 0, y: 0 },
    presence: { ownId: 'me', send() {} },
    loadPeerCharacter() {},
    sendPosition() {},
    textures: {
      exists: (k: string) => textures.has(k),
      get: () => ({ getSourceImage: () => ({}) }),
      // The circle itself is peerAvatar's business (and its test's) — here it
      // only has to yield a key so we can see which chip gets hung.
      createCanvas: (key: string) => {
        textures.add(key)
        return {
          context: {
            save() {},
            restore() {},
            beginPath() {},
            arc() {},
            clip() {},
            drawImage() {},
            stroke() {},
          },
          refresh() {},
        }
      },
    },
    load: {
      image() {},
      once: (_event: string, fn: () => void) => void drains.push(fn),
      start() {},
    },
    // Drain the loader; `arrived` names the keys whose bytes actually landed.
    settle(...arrived: string[]) {
      arrived.forEach((k) => textures.add(k))
      drains.splice(0).forEach((fn) => fn())
    },
    add: {
      sprite: () => fakeSprite(),
      text: () => fakeSprite(),
      image: (_x: number, _y: number, key: string) => Object.assign(fakeSprite(), { key }),
      container(x: number, y: number, list: unknown[]) {
        return {
          x,
          y,
          list,
          add(child: unknown) {
            list.push(child)
          },
          destroy() {},
          setDepth() {
            return this
          },
          setVisible() {
            return this
          },
          setPosition() {
            return this
          },
        }
      },
    },
    tweens: { killTweensOf() {}, add() {} },
  })
}

const move = {
  type: 'move' as const,
  userId: 'peer',
  name: 'Peer',
  x: 3,
  y: 4,
  facing: 'down' as const,
  manifestId: null,
}

// The sprite and the name label; a face is the third thing on the nameplate.
const NAMEPLATE = 2

describe('peer nameplate avatar', () => {
  it('hangs the face on the nameplate once it lands', () => {
    const scene = fakeScene()
    scene.presenceFrame(move)
    scene.settle('peer.avatar.peer')

    const list = scene.remoteSprites.get('peer').list
    expect(list).toHaveLength(NAMEPLATE + 1)
    expect(list.at(-1).key).toBe('peer.avatar.peer.round')
  })

  it('leaves the nameplate plain when the person has no avatar', () => {
    const scene = fakeScene()
    scene.presenceFrame(move)
    scene.settle()

    expect(scene.remoteSprites.get('peer').list).toHaveLength(NAMEPLATE)
  })

  it('hangs nothing on a peer who left while their face was in flight', () => {
    const scene = fakeScene()
    scene.presenceFrame(move)
    const left = scene.remoteSprites.get('peer')
    scene.dropPeer('peer')
    scene.settle('peer.avatar.peer')

    expect(left.list).toHaveLength(NAMEPLATE)
  })
})
