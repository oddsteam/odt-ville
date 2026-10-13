import { describe, expect, it, vi } from 'vitest'
import { mapPresence } from './presence'

const handle = { send() {}, onFrame() {}, disconnect() {} }
const loadManifest = async () => null

describe('Discord shell presence (#570)', () => {
  it('opens the map room and bundles the viewer for the scene', () => {
    const connect = vi.fn(() => handle)

    const p = mapPresence({ slug: 'office-ktb', multiplayer: true }, 'discord:42', 'Pim', connect, loadManifest)

    expect(connect).toHaveBeenCalledWith('office-ktb')
    expect(p).toEqual({ ownId: 'discord:42', ownName: 'Pim', loadManifest, ...handle })
  })

  it('stays offline on a solo map or without a viewer id', () => {
    const connect = vi.fn(() => handle)

    expect(mapPresence({ slug: 's', multiplayer: false }, 'discord:42', 'Pim', connect, loadManifest)).toBeNull()
    expect(mapPresence({ slug: 's', multiplayer: true }, null, null, connect, loadManifest)).toBeNull()
    expect(connect).not.toHaveBeenCalled()
  })

  it('stays offline when the cable cannot open (no token)', () => {
    expect(mapPresence({ slug: 's', multiplayer: true }, 'discord:42', 'Pim', () => null, loadManifest)).toBeNull()
  })
})
