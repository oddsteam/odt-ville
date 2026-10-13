import { describe, expect, it } from 'vitest'
import { discordLaunchRewrite } from './vite-discord-entry'

const url = (u) => {
  const req = { url: u }
  discordLaunchRewrite(req, null, () => {})
  return req.url
}

describe('discordLaunchRewrite', () => {
  it('serves the Discord shell for the Activity launch (/ with frame_id)', () => {
    expect(url('/?instance_id=i-1&frame_id=f-1&platform=desktop')).toBe(
      '/discord.html?instance_id=i-1&frame_id=f-1&platform=desktop',
    )
  })

  it('leaves the web app root, other paths and frame_id elsewhere alone', () => {
    expect(url('/')).toBe('/')
    expect(url('/?next=/maps/x')).toBe('/?next=/maps/x')
    expect(url('/api/v1/me?frame_id=f')).toBe('/api/v1/me?frame_id=f')
    expect(url('/assets/discord-abc.js')).toBe('/assets/discord-abc.js')
  })
})
