import { describe, expect, it } from 'vitest'

import { assignedBuildingIds, isUnplaced, townErrorMessage } from './townLoader.ts'
import { NetworkError, RequestError } from './lib/http.ts'

const request = (status: number) => new RequestError({ path: '/x', status, body: '' })

// The id list the one batched tile-object fetch (#138) resolves for the
// per-community building assignments (#292): distinct, unassigned skipped.
describe('assignedBuildingIds', () => {
  it('collects distinct assigned ids, skipping unassigned communities', () => {
    expect(
      assignedBuildingIds([
        { tile_object_id: 7 },
        { tile_object_id: null },
        {},
        { tile_object_id: 7 },
        { tile_object_id: 3 },
      ]),
    ).toEqual([7, 3])
  })
})

// The empty-town backstop (#501): communities ARE the town's buildings, so an
// empty resolved list means the user hasn't been placed — the shell shows a
// "not placed yet" line instead of a degenerate one-plot ghost town.
describe('isUnplaced', () => {
  it('is true when the resolved building list is empty (no ghost town)', () => {
    expect(isUnplaced([])).toBe(true)
  })

  it('is false as soon as there is at least one community', () => {
    expect(isUnplaced([{ id: 1 }])).toBe(false)
  })
})

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
