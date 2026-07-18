import { describe, expect, it } from 'vitest'

import { townErrorMessage } from './townLoader.ts'
import { NetworkError, RequestError } from './lib/http.ts'

const request = (status: number) => new RequestError({ path: '/x', status, body: '' })

describe('townErrorMessage', () => {
  it('maps 401/403 to the no-access message', () => {
    expect(townErrorMessage(request(401))).toBe("YOU DON'T HAVE ACCESS TO ENTER THE VILLAGE")
    expect(townErrorMessage(request(403))).toBe("YOU DON'T HAVE ACCESS TO ENTER THE VILLAGE")
  })

  it('maps 5xx and network failures to the temporarily-unavailable message', () => {
    const unavailable = 'THE VILLAGE IS TEMPORARILY UNAVAILABLE — TRY AGAIN IN A MOMENT'
    expect(townErrorMessage(request(500))).toBe(unavailable)
    expect(townErrorMessage(request(502))).toBe(unavailable)
    expect(townErrorMessage(new NetworkError({ path: '/x', reason: 'Failed to fetch' }))).toBe(
      unavailable,
    )
  })

  it('falls back to the error message for anything else', () => {
    expect(townErrorMessage(new Error('boom'))).toBe('boom')
    expect(townErrorMessage('weird')).toBe('CAN’T REACH THE VILLAGE')
  })
})
